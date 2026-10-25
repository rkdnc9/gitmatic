import { GitError } from '../errors'
import { registerGit } from '../run'
import type { Ctx } from '../run'
import { headCommit, resolveRev } from '../revs'
import type { Repo, Tree, WorktreeState } from '../types'
import { unifiedDiff } from '../textDiff'
import { normalizePath, requireRepo, workdir } from '../world'

/**
 * Diffs `a` into `b` for every path in `paths` (or the union of both trees'
 * keys when null), printing nothing for files whose content is unchanged.
 */
function emitTreeDiff(c: Ctx, a: Tree, b: Tree, paths: string[] | null): void {
  const all = paths ?? Array.from(new Set([...Object.keys(a), ...Object.keys(b)]))
  for (const path of all.sort()) {
    const before = Object.hasOwn(a, path) ? a[path] : null
    const after = Object.hasOwn(b, path) ? b[path] : null
    if (before === after) continue
    for (const line of unifiedDiff(path, before, after)) c.out(line.text, line.tone)
  }
}

/** Resolves a revision argument, failing with git's exact ambiguous-argument error. */
function resolveRevOrFail(repo: Repo, wt: WorktreeState, rev: string): string {
  const id = resolveRev(repo, wt, rev)
  if (id === null) {
    throw new GitError(
      `fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`,
    )
  }
  return id
}

function treeOf(repo: Repo, id: string): Tree {
  return repo.commits[id].tree ?? {}
}

registerGit('diff', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  let staged = false
  const revs: string[] = []
  const paths: string[] = []
  let afterDashDash = false
  for (const a of argv) {
    if (afterDashDash) {
      // Unknown pathspecs are allowed by git; they simply match nothing.
      const p = normalizePath(ctx.w, a)
      if (p !== null) paths.push(p)
      continue
    }
    if (a === '--') {
      afterDashDash = true
    } else if (a === '--staged' || a === '--cached') {
      staged = true
    } else if (a.startsWith('-') && a !== '-') {
      throw new GitError(`error: unknown option '${a.replace(/^-+/, '')}'`)
    } else {
      revs.push(a)
    }
  }
  if (revs.length > 2) throw new GitError('fatal: too many revisions')

  const work = workdir(ctx.w)
  const index = wt.index
  const pathFilter = paths.length > 0 ? paths : null
  const headId = headCommit(repo, wt)

  if (revs.length === 0) {
    if (staged) {
      // index vs HEAD (unborn HEAD diffs against the empty tree)
      emitTreeDiff(ctx, headId ? treeOf(repo, headId) : {}, index, pathFilter)
    } else {
      // workdir vs index: untracked files (absent from the index) are ignored
      const after: Tree = {}
      for (const p of Object.keys(index)) {
        if (Object.hasOwn(work, p)) after[p] = work[p]
      }
      emitTreeDiff(ctx, index, after, pathFilter ?? Object.keys(index))
    }
  } else if (revs.length === 1) {
    const id = resolveRevOrFail(repo, wt, revs[0])
    if (staged) {
      // `diff --staged <rev>`: rev vs index
      emitTreeDiff(ctx, treeOf(repo, id), index, pathFilter)
    } else {
      // rev vs workdir, but the workdir only shadows the index: a path that is
      // not in the index is taken from the index (absent), never from the workdir.
      const after: Tree = {}
      for (const p of Object.keys(index)) {
        if (Object.hasOwn(work, p)) after[p] = work[p]
      }
      emitTreeDiff(ctx, treeOf(repo, id), after, pathFilter)
    }
  } else {
    // rev vs rev: plain tree delta
    const a = treeOf(repo, resolveRevOrFail(repo, wt, revs[0]))
    const b = treeOf(repo, resolveRevOrFail(repo, wt, revs[1]))
    emitTreeDiff(ctx, a, b, pathFilter)
  }
})