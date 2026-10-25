import { GitError } from '../errors'
import { registerGit } from '../run'
import type { Ctx } from '../run'
import { resolveRev } from '../revs'
import type { Repo, Tree, WorktreeState } from '../types'
import { normalizePath, requireRepo, workdir } from '../world'

/**
 * `git reset [--soft|--mixed|--hard] [rev] [-- <path>...]` (default: mixed, HEAD).
 * - --hard:   move HEAD, index and workdir to the target tree.
 * - --mixed:  move HEAD + index to the target tree; keep the workdir.
 * - --soft:   move HEAD only; keep index and workdir.
 * - paths:    unstage those paths (index := current HEAD tree for those paths).
 *
 * Without `--`, the first positional is a revision when it resolves, otherwise a
 * path when it names a known file, otherwise git's "ambiguous argument" error.
 * With `--`, every non-flag positional after it is a pathspec; one that matches
 * nothing is a silent no-op. A mixed/default reset prints
 * "Unstaged changes after reset:" + one `M\t<file>` line (sorted) for each
 * workdir-vs-index difference.
 */
registerGit('reset', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  let mode: 'hard' | 'mixed' | 'soft' = 'mixed'
  const positionals: string[] = []
  const pathsAfterDashDash: string[] = []
  let afterDashDash = false
  for (const a of argv) {
    if (afterDashDash) pathsAfterDashDash.push(a)
    else if (a === '--') afterDashDash = true
    else if (a === '--hard') mode = 'hard'
    else if (a === '--mixed') mode = 'mixed'
    else if (a === '--soft') mode = 'soft'
    else positionals.push(a)
  }

  if (mode === 'hard' && pathsAfterDashDash.length > 0)
    throw new GitError('fatal: Cannot do hard reset with paths.')

  const throwAmbiguous = (arg: string): void => {
    throw new GitError(`fatal: ambiguous argument '${arg}': unknown revision or path not in the working tree.`, [
      "Use '--' to separate paths from revisions, like this:",
      "'git <command> [<revision>...] -- [<file>...}'",
    ])
  }

  // Decide the revision and the pathspecs.
  let rev: string | null = null
  let paths: string[] = []
  if (afterDashDash) {
    rev = positionals.length > 0 ? positionals[0] : null
    paths = pathsAfterDashDash
  } else if (positionals.length === 0) {
    rev = null
    paths = []
  } else if (resolveRev(repo, wt, positionals[0]) !== null) {
    rev = positionals[0]
    paths = positionals.slice(1)
  } else if (knownPath(ctx, repo, wt, positionals[0])) {
    rev = null
    paths = positionals
  } else {
    throwAmbiguous(positionals[0])
  }

  const headSha = wt.head.type === 'branch' ? (repo.branches[wt.head.name] ?? null) : wt.head.commit
  // Target tree: the resolved rev when given, else the current HEAD (empty when unborn).
  const resolvedTargetSha = rev !== null ? (resolveRev(repo, wt, rev) as string) : headSha
  const target: Tree = resolvedTargetSha ? (repo.commits[resolvedTargetSha].tree ?? {}) : {}

  // Path mode: unstage the given paths. Matching-nothing paths are no-ops.
  if (paths.length > 0) {
    if (mode !== 'soft') {
      const idx: Tree = { ...wt.index }
      for (const raw of paths) {
        const f = normalizePath(ctx.w, raw)
        if (f === null) continue
        if (Object.hasOwn(target, f)) idx[f] = target[f]
        else delete idx[f]
      }
      wt.index = idx
    }
  } else if (resolvedTargetSha !== null && headSha !== null) {
    // Rev-only reset (no paths): move HEAD in every mode (soft/mixed/hard).
    if (wt.head.type === 'branch') repo.branches[wt.head.name] = resolvedTargetSha
    else wt.head = { type: 'detached', commit: resolvedTargetSha }
  }

  if (mode === 'hard') {
    wt.index = { ...target }
    ctx.w.files[ctx.w.cwd] = { ...target }
    if (headSha !== null)
      ctx.out(`HEAD is now at ${resolvedTargetSha} ${repo.commits[resolvedTargetSha].message.split('\n')[0]}`)
    return
  }

  if (mode === 'mixed') {
    if (headSha !== null) {
      if (rev !== null || paths.length === 0) wt.index = { ...target }
      const work = workdir(ctx.w)
      const lines: string[] = []
      for (const f of Object.keys(wt.index)) {
        if (work[f] !== wt.index[f]) lines.push(`M\t${f}`)
      }
      if (lines.length > 0) {
        lines.sort()
        ctx.out('Unstaged changes after reset:')
        for (const l of lines) ctx.out(l)
      }
    }
  }
})

/** True when `raw` names a file git knows about (in the index, workdir or HEAD tree). */
function knownPath(ctx: Ctx, repo: Repo, wt: WorktreeState, raw: string): boolean {
  const f = normalizePath(ctx.w, raw)
  if (f === null) return false
  const headSha = wt.head.type === 'branch' ? (repo.branches[wt.head.name] ?? null) : wt.head.commit
  const headTree = headSha ? (repo.commits[headSha].tree ?? {}) : {}
  return Object.hasOwn(wt.index, f) || Object.hasOwn(ctx.w.files[ctx.w.cwd], f) || Object.hasOwn(headTree, f)
}
