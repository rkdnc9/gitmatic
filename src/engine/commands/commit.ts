import { GitError } from '../errors'
import { commitId } from '../hash'
import { registerGit } from '../run'
import type { Ctx } from '../run'
import { headCommit } from '../revs'
import type { Commit, Repo, Sha, WorktreeState } from '../types'
import { requireRepo, workdir } from '../world'

const AUTHOR = 'You <you@gitmatic.dev>'

function treesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((k, i) => k === bKeys[i] && a[k] === b[k])
}

/** Is `path` tracked by some ancestor of HEAD (so commit -a may stage its changes)? */
function isTracked(repo: Repo, wt: WorktreeState, path: string): boolean {
  const head = headCommit(repo, wt)
  if (!head) return false
  return Object.hasOwn(repo.commits[head].tree, path)
}

/** `commit -a`: stage modifications/deletions of tracked files only; new files stay untracked. */
function autoStage(ctx: Ctx, wt: WorktreeState): void {
  const repo = ctx.w.repo!
  const work = workdir(ctx.w)
  const index = wt.index
  for (const path of Object.keys(work)) {
    if (isTracked(repo, wt, path)) index[path] = work[path]
  }
  for (const path of Object.keys(index)) {
    if (!Object.hasOwn(work, path)) delete index[path]
  }
}

/** Deterministic seed so identical commits hash to the same id across runs. */
function seedFor(
  parents: Sha[],
  tree: Record<string, string>,
  message: string,
  time: number,
): string {
  const parts = [parents.join(','), message, String(time)]
  for (const key of Object.keys(tree).sort()) parts.push(`${key}=${tree[key]}`)
  return parts.join('|')
}

registerGit('commit', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  let amend = false
  let auto = false
  let message: string | null = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--amend') amend = true
    else if (a === '-a' || a === '--all') auto = true
    else if (a === '-m' || a === '--message') {
      if (i + 1 >= argv.length) throw new GitError(`error: option '${a}' requires a value`)
      message = argv[i + 1]
      i++
    } else if (a.startsWith('-m') || a.startsWith('--message=')) {
      message = a.startsWith('-m') ? a.slice(2) : a.slice('--message='.length)
    } else if (a === '-am' || a === '-ma') {
      auto = true
      if (i + 1 >= argv.length) throw new GitError(`error: switch '${a}' requires a value`)
      message = argv[i + 1]
      i++
    } else if (a.startsWith('-')) {
      throw new GitError(`error: unknown option '${a.replace(/^--/, '')}'`)
    } else {
      throw new GitError(`error: unrecognized argument: ${a}`)
    }
  }

  const head = headCommit(repo, wt)
  if (amend && !head) throw new GitError('fatal: You have nothing to amend.')
  // A merge in progress: conclude it into a two-parent merge commit.
  if (wt.pending) {
    if (wt.pending.conflicts.length > 0) {
      throw new GitError('error: Committing is not possible because you have unmerged files.')
    }
    if (head === null) throw new GitError('fatal: not a valid object name: HEAD')
    const mergeParents: Sha[] = [head, wt.pending.theirs]
    const mergeTree = { ...wt.index }
    const mergeMsg = message ?? wt.pending.message
    const mergeId = commitId(
      seedFor(mergeParents, mergeTree, mergeMsg, ctx.w.clock),
      (c) => Object.hasOwn(repo.commits, c) && c !== head,
    )
    repo.commits[mergeId] = {
      id: mergeId,
      parents: mergeParents,
      message: mergeMsg,
      author: AUTHOR,
      time: ctx.w.clock,
      tree: mergeTree,
    }
    if (wt.head.type === 'branch') repo.branches[wt.head.name] = mergeId
    else wt.head = { type: 'detached', commit: mergeId }
    wt.pending = null
    ctx.out(`[${wt.head.type === 'branch' ? wt.head.name : 'detached HEAD'} ${mergeId}] ${mergeMsg.split('\n')[0]}`)
    ctx.note(`Merged into ${wt.head.type === 'branch' ? wt.head.name : 'HEAD'} (${mergeId})`)
    return
  }

  if (auto) autoStage(ctx, wt)

  const index = wt.index
  const headTree = head ? repo.commits[head].tree : {}
  const nothingStaged = treesEqual(index, headTree)

  // Refuse when nothing is staged: distinguish clean from unstaged-only, and refuse
  // empty messages only once there is actually something to commit (git's order).
  if (!amend && nothingStaged) {
    const work = workdir(ctx.w)
    const workClean = treesEqual(work, headTree)
    throw new GitError(
      workClean
        ? 'nothing to commit, working tree clean'
        : 'no changes added to commit (use "git add" and/or "git commit -a")',
    )
  }
  if (message === null && !amend) {
    throw new GitError('Aborting commit due to empty commit message.', [
      'Use git commit -m "message"',
    ])
  }

  const branchName = wt.head.type === 'branch' ? wt.head.name : 'detached HEAD'
  // --amend replaces the tip: its parents are the old tip's parents.
  const parents: Sha[] = amend && head ? [...repo.commits[head].parents] : head ? [head] : []
  const oldMessage = head ? repo.commits[head].message : ''

  // For --amend with nothing staged, re-commit the head's tree unchanged.
  let tree: Record<string, string>
  if (amend && nothingStaged && head) {
    tree = { ...headTree }
  } else {
    tree = { ...index }
  }

  const msg = message ?? oldMessage
  const id = commitId(
    seedFor(parents, tree, msg, ctx.w.clock),
    (c) => Object.hasOwn(repo.commits, c) && c !== head,
  )
  const commit: Commit = {
    id,
    parents,
    message: msg,
    author: AUTHOR,
    time: ctx.w.clock,
    tree,
  }
  if (amend && head) {
    for (const b of Object.keys(repo.branches)) {
      if (repo.branches[b] === head) repo.branches[b] = id
    }
    if (wt.head.type === 'detached') wt.head = { type: 'detached', commit: id }
    delete repo.commits[head]
  }
  repo.commits[id] = commit
  if (wt.head.type === 'branch') repo.branches[wt.head.name] = id
  else if (!amend) wt.head = { type: 'detached', commit: id }

  // The index stays in sync with the committed tree (real git behaviour).
  wt.index = { ...tree }

  const rootMark = parents.length === 0 && !amend ? ' (root-commit)' : ''
  ctx.out(`[${branchName}${rootMark} ${id}] ${msg.split('\n')[0]}`)
  ctx.note(`Saved commit ${id} on ${branchName} — ${branchName} points to it.`)
})
