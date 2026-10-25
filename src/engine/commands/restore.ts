import { GitError } from '../errors'
import { parseArgs } from '../args'
import { registerGit } from '../run'
import { headCommit, resolveRev } from '../revs'
import type { Tree } from '../types'
import { normalizePath, requireRepo, workdir } from '../world'

/**
 * `git restore`:
 *   restore <path>                   workdir  = index[<path>]
 *   restore --staged <path>          index    = HEAD[<path>]  (delete if absent from HEAD)
 *   restore --source=<rev> <path>    workdir  = <rev>[<path>] (delete if absent from <rev>)
 *   restore --staged --source=<rev>  index    = <rev>[<path>] (delete if absent from <rev>)
 *
 * The pathspec must be "known to git" (in the index or in the source tree),
 * else: `error: pathspec '<path>' did not match any file(s) known to git`.
 * A failing path aborts the whole command before anything is touched.
 */
registerGit('restore', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  const parsed = parseArgs(argv, {
    bool: ['staged'],
    string: ['source'],
  })

  const paths = [...parsed.positionals, ...parsed.afterDashDash]
  if (paths.length === 0) throw new GitError('fatal: you must specify path(s) to restore')

  const staged = parsed.flags.staged === true
  const source = typeof parsed.flags.source === 'string' ? parsed.flags.source : null

  // The source tree: an explicit <rev>, HEAD for --staged, or the index.
  let sourceTree: Tree
  if (source !== null) {
    const id = resolveRev(repo, wt, source)
    if (id === null) throw new GitError(`fatal: could not resolve '${source}'`)
    sourceTree = repo.commits[id].tree ?? {}
  } else if (staged) {
    const headId = headCommit(repo, wt)
    if (headId === null) throw new GitError("fatal: could not resolve 'HEAD'")
    sourceTree = repo.commits[headId].tree ?? {}
  } else {
    sourceTree = wt.index
  }

  const work = workdir(ctx.w)
  const index = wt.index

  // Validate every path first (git is all-or-nothing), then apply.
  const resolved = paths.map((raw) => {
    const path = normalizePath(ctx.w, raw)
    if (path === null || (!Object.hasOwn(index, path) && !Object.hasOwn(sourceTree, path))) {
      throw new GitError(`error: pathspec '${raw}' did not match any file(s) known to git`)
    }
    return path
  })

  for (const path of resolved) {
    const target = staged ? index : work
    if (Object.hasOwn(sourceTree, path)) target[path] = sourceTree[path]
    else delete target[path]
  }

  const n = paths.length
  ctx.note(
    staged
      ? `Restored staged content (${n} ${n === 1 ? 'file' : 'files'})`
      : `Restored ${n} ${n === 1 ? 'file' : 'files'} in the working tree`,
  )
})