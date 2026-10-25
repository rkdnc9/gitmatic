import { GitError } from '../errors'
import { registerGit } from '../run'
import type { Ctx } from '../run'
import { reachable, resolveRev } from '../revs'
import type { Head, Repo, Sha, WorktreeState } from '../types'
import { moveHeadTo, normalizePath, requireRepo } from '../world'

/** Number of commits reachable from a (leaving) detached HEAD but from no branch. */
function strandedCount(repo: Repo, fromHead: Head): number {
  if (fromHead.type !== 'detached') return 0
  const kept = new Set<Sha>()
  for (const tip of Object.values(repo.branches)) {
    if (tip) for (const s of reachable(repo, [tip])) kept.add(s)
  }
  let n = 0
  for (const s of reachable(repo, [fromHead.commit])) if (!kept.has(s)) n++
  return n
}

/**
 * Prints the stranded-commit warning (if leaving a detached HEAD with orphaned
 * commits) and then moves the worktree's HEAD to `newHead` at `target`, carrying
 * over non-conflicting local changes. Callers print the "Switched to …" line.
 */
export function performSwitch(ctx: Ctx, newHead: Head, target: Sha | null): void {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')
  const oldHead = wt.head
  const n = strandedCount(repo, oldHead)
  if (n > 0) {
    const plural = n === 1 ? '' : 's'
    ctx.out(`Warning: you are leaving ${n} commit${plural} behind and not accessible from any other branch.`, 'hint')
  }
  if (target === null) wt.head = newHead
  else moveHeadTo(ctx, target, newHead)
}
function printDetached(ctx: Ctx, repo: Repo, sha: Sha): void {
  ctx.out(`You are in 'detached HEAD' state.`)
  ctx.out(`HEAD is now at ${sha} ${repo.commits[sha]?.message.split('\n')[0] ?? ''}`)
}


/** Restore working-tree files from a tree (the index when `tree` is null). */
function restorePaths(ctx: Ctx, wt: WorktreeState, tree: Record<string, string> | null, paths: string[]): void {
  const repo = requireRepo(ctx.w)
  const headSha =
    wt.head.type === 'branch' ? (repo.branches[wt.head.name] ?? null) : wt.head.commit
  const headTree = headSha ? (repo.commits[headSha]?.tree ?? {}) : {}
  const source: Record<string, string> = tree ?? wt.index
  for (const raw of paths) {
    const path = normalizePath(ctx.w, raw)
    if (path === null) throw new GitError(`error: pathspec '${raw}' did not match any file(s) known to git`)
    const tracked = Object.hasOwn(source, path) || Object.hasOwn(wt.index, path) || Object.hasOwn(headTree, path)
    if (!tracked) throw new GitError(`error: pathspec '${raw}' did not match any file(s) known to git`)
    const work = ctx.w.files[ctx.w.cwd]
    if (Object.hasOwn(source, path)) work[path] = source[path]
    else delete work[path]
  }
  ctx.note(`Restored ${paths.length} file${paths.length === 1 ? '' : 's'} from ${tree ? 'branch' : 'index'}`)
}

/** Resolve the start point for a new branch; throws git's unborn message. */
function startPoint(ctx: Ctx, wt: WorktreeState, start: string | undefined): Sha {
  const repo = ctx.w.repo!
  const ref = start ?? (wt.head.type === 'branch' ? wt.head.name : 'HEAD')
  const sha = resolveRev(repo, wt, ref)
  if (sha === null) throw new GitError(`fatal: not a valid object name: '${ref}'`)
  return sha
}

registerGit('checkout', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  // Split on `--`: anything after is a pathspec restored from a tree.
  const dd = argv.indexOf('--')
  if (dd !== -1) {
    const ref = dd > 0 ? argv[dd - 1] : undefined
    const paths = argv.slice(dd + 1)
    if (paths.length === 0) {
      throw new GitError('fatal: you must specify at least one path to checkout')
    }
    const tree = ref ? (() => {
      const sha = resolveRev(repo, wt, ref)
      if (sha === null) throw new GitError(`error: pathspec '${ref}' did not match any file(s) known to git`)
      return repo.commits[sha]?.tree ?? {}
    })() : null
    restorePaths(ctx, wt, tree, paths)
    return
  }

  let create = false
  let detach = false
  const pos: string[] = []
  for (const a of argv) {
    if (a === '-b') create = true
    else if (a === '--detach' || a === '-d') detach = true
    else if (a.startsWith('-') && a.length > 1) {
      throw new GitError(`error: unknown option '${a.replace(/^-+/, '')}'`)
    } else {
      pos.push(a)
    }
  }

  if (create) {
    const name = pos[0]
    if (!name) throw new GitError('fatal: missing branch name')
    if (Object.hasOwn(repo.branches, name)) throw new GitError(`fatal: a branch named '${name}' already exists`)
    const sha = startPoint(ctx, wt, pos[1])
    repo.branches[name] = sha
    performSwitch(ctx, { type: 'branch', name }, sha)
    ctx.out(`Switched to a new branch '${name}'`)
    ctx.note(`Created and switched to branch '${name}'`)
    return
  }

  const rev = pos[0]
  if (detach) {
    if (!rev) throw new GitError('fatal: missing commit argument')
    const sha = resolveRev(repo, wt, rev)
    if (sha === null) throw new GitError(`fatal: invalid reference: ${rev}`)
    performSwitch(ctx, { type: 'detached', commit: sha }, sha)
    printDetached(ctx, repo, sha)
    ctx.note(`Detached HEAD at ${sha}`)
    return
  }

  if (!rev) throw new GitError('fatal: you need to specify a branch to checkout or a path to restore')

  if (Object.hasOwn(repo.branches, rev)) {
    if (wt.head.type === 'branch' && wt.head.name === rev) return
    performSwitch(ctx, { type: 'branch', name: rev }, repo.branches[rev])
    ctx.out(`Switched to branch '${rev}'`)
    ctx.note(`Switched to branch '${rev}'`)
    return
  }
  const sha = resolveRev(repo, wt, rev)
  if (sha !== null) {
    performSwitch(ctx, { type: 'detached', commit: sha }, sha)
    printDetached(ctx, repo, sha)
    ctx.note(`Detached HEAD at ${sha}`)
    return
  }
  throw new GitError(`error: pathspec '${rev}' did not match any file(s) known to git`)
})