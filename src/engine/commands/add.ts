import { GitError } from '../errors'
import { registerGit } from '../run'
import type { Ctx } from '../run'
import { normalizePath, requireRepo, workdir } from '../world'
import type { WorktreeState } from '../types'

/** Stage workdir path in the index; index entries without a workdir file are removed (add -A). */
function stagePath(ctx: Ctx, wt: WorktreeState, path: string): void {
  const work = workdir(ctx.w)
  if (Object.hasOwn(work, path)) wt.index[path] = work[path]
  else delete wt.index[path]
  // Staging a file during a merge marks that path resolved.
  if (wt.pending) {
    const i = wt.pending.conflicts.indexOf(path)
    if (i >= 0) wt.pending.conflicts.splice(i, 1)
  }
}

registerGit('add', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  // Parse flags: `--` ends flags; anything else flag-like is an error.
  // A lone `-` is passed through as a (weird but valid) path.
  const specs: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      specs.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith('-') && a !== '-' && a !== '-A') {
      throw new GitError(`error: unknown option '${a.replace(/^-+/, '')}'`)
    }
    specs.push(a)
  }

  if (specs.length === 0) {
    ctx.out('Nothing specified, nothing added.')
    ctx.out("Maybe you wanted to say 'git add .'?")
    ctx.out('Disable this message with "git config set advice.addEmptyPathspec false"')
    return
  }

  const wholeTree = specs.includes('.') || specs.includes('-A')
  const paths = specs.filter((s) => s !== '.' && s !== '-A')

  // Validate every explicit path first so git's "all-or-nothing" error matches.
  if (paths.length > 0) {
    const work = workdir(ctx.w)
    for (const raw of paths) {
      const path = normalizePath(ctx.w, raw)
      if (path === null || (!Object.hasOwn(work, path) && !Object.hasOwn(wt.index, path))) {
        throw new GitError(`fatal: pathspec '${raw}' did not match any files`)
      }
    }
  }

  if (wholeTree) {
    // `git add .` / `git add -A`: stage every workdir path, remove staged-but-deleted.
    for (const path of Object.keys(workdir(ctx.w))) stagePath(ctx, wt, path)
    for (const path of Object.keys(wt.index)) {
      if (!Object.hasOwn(workdir(ctx.w), path)) delete wt.index[path]
    }
    ctx.note('Staged all changes')
    return
  }

  for (const raw of paths) {
    const path = normalizePath(ctx.w, raw)
    if (path !== null) stagePath(ctx, wt, path)
  }
  ctx.note(paths.length === 1 ? 'Staged 1 file' : `Staged ${paths.length} files`)
})