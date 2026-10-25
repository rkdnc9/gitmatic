import { GitError } from '../errors'
import { commitId } from '../hash'
import { registerGit } from '../run'
import type { Ctx } from '../run'
import { headCommit, resolveRev } from '../revs'
import type { Commit, Pending, Tree } from '../types'
import { requireRepo, workdir } from '../world'

const AUTHOR = 'You <you@gitmatic.dev>'

const NO_OP = 'error: no cherry-pick or revert in progress'

/** Shared by revert/cherry-pick: commit the resolved pending state. */
function commitPending(ctx: Ctx, pending: Pending): void {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]!
  const work = workdir(ctx.w)
  for (const f of pending.conflicts) {
    if (!Object.hasOwn(wt.index, f) || !Object.hasOwn(work, f) || wt.index[f] !== work[f])
      throw new GitError([
        'error: Committing is not possible because you have unmerged files.',
        "hint: Fix them up in the work tree, and then use 'git add/rm <file>' as appropriate",
        'hint: to mark resolution.',
        `fatal: ${pending.type} failed`,
      ])
  }
  const tree: Tree = { ...wt.index }
  const parents = pending.origHead ? [pending.origHead] : []
  const id = commitId(
    [parents.join(','), JSON.stringify(tree), pending.message, String(ctx.w.clock)].join('|'),
    (c) => Object.hasOwn(repo.commits, c),
  )
  const commit: Commit = {
    id,
    parents,
    message: pending.message,
    author: AUTHOR,
    time: ctx.w.clock,
    tree,
  }
  repo.commits[id] = commit
  const branch = wt.head.type === 'branch' ? wt.head.name : 'detached HEAD'
  if (wt.head.type === 'branch') repo.branches[wt.head.name] = id
  else wt.head = { type: 'detached', commit: id }
  wt.index = { ...tree }
  wt.pending = null
  ctx.out(`[${branch} ${id}] ${pending.message.split('\n')[0]}`)
  ctx.note(`Cherry-picked a commit on ${branch} (${id})`)
}

/**
 * `git cherry-pick <rev>` — replay `<rev>`'s change onto the current branch as a
 * new commit (same message). Three-way: base = <rev>.parent.tree, ours = HEAD tree,
 * theirs = <rev>.tree. Conflict → 'cherry-pick' pending; `--continue`/`--abort`.
 */
registerGit('cherry-pick', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt)
    throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  let action: 'run' | 'continue' | 'abort' = 'run'
  let revArg: string | null = null
  for (const a of argv) {
    if (a === '--continue') action = 'continue'
    else if (a === '--abort' || a === '--skip') action = 'abort'
    else if (a.startsWith('-'))
      throw new GitError(`error: unknown option '${a.replace(/^--/, '')}'`)
    else revArg = a
  }

  if (action === 'continue') {
    const p = wt.pending
    if (!p || p.type !== 'cherry-pick') throw new GitError([NO_OP, 'fatal: cherry-pick failed'])
    commitPending(ctx, p)
    return
  }
  if (action === 'abort') {
    const p = wt.pending
    if (!p || p.type !== 'cherry-pick') throw new GitError([NO_OP, 'fatal: cherry-pick failed'])
    if (p.preWork !== null) ctx.w.files[ctx.w.cwd] = { ...p.preWork }
    wt.index = { ...repo.commits[p.origHead].tree }
    wt.pending = null
    ctx.note('Aborted the cherry-pick; restored the previous state')
    return
  }

  if (revArg === null) throw new GitError("fatal: bad revision 'HEAD'")
  if (wt.pending) throw new GitError([NO_OP, 'fatal: cherry-pick failed'])
  const rev = resolveRev(repo, wt, revArg)
  if (rev === null) throw new GitError(`fatal: bad revision '${revArg}'`)
  const c = repo.commits[rev]

  const headSha = headCommit(repo, wt)
  const headTree: Tree = headSha ? (repo.commits[headSha].tree ?? {}) : {}
  const work = workdir(ctx.w)

  // Refuse when local changes would be overwritten.
  for (const f of Object.keys(wt.index)) {
    if (wt.index[f] !== headTree[f])
      throw new GitError([
        'error: your local changes would be overwritten by cherry-pick.',
        'hint: commit your changes or stash them to proceed.',
        'fatal: cherry-pick failed',
      ])
  }
  for (const f of Object.keys(work)) {
    if ((Object.hasOwn(wt.index, f) || Object.hasOwn(headTree, f)) && work[f] !== headTree[f])
      throw new GitError([
        'error: Your local changes to the following files would be overwritten by merge:',
        `\t${f}`,
        'Please commit your changes or stash them before you merge.',
        'Aborting',
        'fatal: cherry-pick failed',
      ])
  }

  const base: Tree = c.parents.length > 0 ? (repo.commits[c.parents[0]].tree ?? {}) : {}
  const ours: Tree = headTree
  const theirs: Tree = c.tree
  const preWork: Tree = { ...work }
  const { tree, conflicts } = threeWay(base, ours, theirs, rev, c.message)
  ctx.w.files[ctx.w.cwd] = { ...tree }
  const sorted = conflicts.sort()
  const message = c.message

  if (sorted.length === 0) {
    wt.index = { ...tree }
    commitPending(ctx, {
      type: 'cherry-pick',
      theirs: rev,
      message,
      origHead: headSha ?? '',
      conflicts: [],
      base: c.parents[0] ?? '',
      preWork,
    })
    return
  }
  wt.index = { ...ours }
  for (const f of sorted) ctx.out(`CONFLICT (content): Merge conflict in ${f}`)
  for (const f of sorted) ctx.out(`error: cherry-pick: ${f}: needs merge`)
  ctx.out('hint: After resolving the conflicts, mark them with')
  ctx.out('hint: "git add/rm <file>" as appropriate')
  ctx.out('hint: and run "git cherry-pick --continue"')
  ctx.out('hint: To abort the command, run "git cherry-pick --abort"')
  wt.pending = {
    type: 'cherry-pick',
    theirs: rev,
    message,
    conflicts: sorted,
    origHead: headSha ?? '',
    base: c.parents[0] ?? '',
    preWork,
  }
  ctx.note(`Cherry-pick conflicts in ${sorted.length} file${sorted.length === 1 ? '' : 's'}`)
})

/** Standard three-way merge; returns the merged tree + any conflict paths. */
function threeWay(
  base: Tree,
  ours: Tree,
  theirs: Tree,
  theirSha: string,
  theirMsg: string,
): { tree: Tree; conflicts: string[] } {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])]
  const tree: Tree = {}
  const conflicts: string[] = []
  for (const f of keys) {
    const b = base[f]
    const o = ours[f]
    const t = theirs[f]
    const oursChanged = o !== b
    const theirsChanged = t !== b
    if (oursChanged && theirsChanged && o !== t) {
      conflicts.push(f)
      tree[f] =
        `<<<<<<< HEAD\n${o !== undefined ? o : ''}\n=======\n${t !== undefined ? t : ''}\n>>>>>>> ${theirSha.slice(0, 7)} (${theirMsg.split('\n')[0]})\n`
    } else if (oursChanged && !theirsChanged) {
      if (o !== undefined) tree[f] = o
    } else if (theirsChanged && !oursChanged) {
      if (t !== undefined) tree[f] = t
    } else {
      if (o !== undefined) tree[f] = o
    }
  }
  return { tree, conflicts }
}
