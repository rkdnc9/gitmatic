import { GitError } from '../errors'
import { commitId } from '../hash'
import { mergeTrees, type ConflictKind } from '../merge3'
import { registerGit } from '../run'
import type { Ctx } from '../run'
import { headCommit, isAncestor, mergeBase, resolveRev } from '../revs'
import type { Commit, Repo, Sha, Tree, WorktreeState } from '../types'
import { requireRepo, workdir } from '../world'

const AUTHOR = 'You <you@gitmatic.dev>'
const DELETED = '\u0000__deleted__'

/** Deterministic seed so identical merge commits hash to the same id across runs. */
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

/** The value of `f` in `tree`, or `def` when absent. */
function get(tree: Tree, f: string, def: string): string {
  return Object.hasOwn(tree, f) ? tree[f] : def
}

/** The default merge-commit message, matching git's conventions. */
function defaultMergeMessage(repo: Repo, wt: WorktreeState, target: string, theirSha: string): string {
  const curName = wt.head.type === 'branch' ? wt.head.name : null
  if (Object.hasOwn(repo.branches, target)) {
    return curName !== null && curName !== 'main'
      ? `Merge branch '${target}' into ${curName}`
      : `Merge branch '${target}'`
  }
  return `Merge commit '${theirSha}'`
}

/**
 * The working-tree value after a merge: paths the merge changes take the result
 * value; untouched paths keep any local content; untracked local files carry through.
 */
function applyToWorkdir(base: Tree, work: Tree, result: Tree): Tree {
  const out: Tree = {}
  const paths = new Set([...Object.keys(base), ...Object.keys(work), ...Object.keys(result)])
  for (const f of paths) {
    const b = get(base, f, DELETED)
    const r = get(result, f, DELETED)
    const local = get(work, f, DELETED)
    // Untracked local file the merge does not create: keep it.
    if (b === DELETED && local !== DELETED && r === DELETED) {
      out[f] = local
      continue
    }
    if (b === r) {
      if (local !== DELETED) out[f] = local
      else if (r !== DELETED) out[f] = r
      continue
    }
    if (r !== DELETED) out[f] = r
  }
  return out
}

/**
 * Local changes the merge would overwrite, the way git classifies them. A path counts
 * only when the merge changes its index value (result differs from index). "staged" = the
 * index already differs from HEAD; "workdir" = the file differs from the index.
 */
function dirtyByMerge(base: Tree, index: Tree, work: Tree, result: Tree): { staged: string[]; workdir: string[] } {
  const staged: string[] = []
  const workdir: string[] = []
  const paths = Array.from(new Set([...Object.keys(base), ...Object.keys(index), ...Object.keys(work), ...Object.keys(result)])).sort()
  for (const f of paths) {
    if (get(result, f, DELETED) === get(index, f, DELETED)) continue // the merge does not change this path's index
    if (!Object.hasOwn(base, f) && !Object.hasOwn(index, f)) continue // purely untracked -> untracked check
    if (get(index, f, DELETED) !== get(base, f, DELETED)) staged.push(f)
    if (get(work, f, DELETED) !== get(index, f, DELETED)) workdir.push(f)
  }
  return { staged, workdir }
}

/** Prints the conflict messages in sorted path order, then the failure summary. */
function reportConflicts(
  c: Ctx,
  autoMerged: string[],
  conflicts: string[],
  kinds: Record<string, ConflictKind>,
  md: Record<string, { deleted: string; modified: string }>,
): void {
  const auto = new Set(autoMerged)
  const conflicted = new Set(conflicts)
  const order = Array.from(new Set([...autoMerged, ...conflicts])).sort()
  for (const f of order) {
    if (auto.has(f)) c.out(`Auto-merging ${f}`)
    if (conflicted.has(f)) {
      const kind = kinds[f]
      if (kind === 'content') c.out(`CONFLICT (content): Merge conflict in ${f}`)
      else if (kind === 'add/add') c.out(`CONFLICT (add/add): Merge conflict in ${f}`)
      else {
        const { deleted, modified } = md[f] ?? { deleted: 'HEAD', modified: 'HEAD' }
        c.out(
          `CONFLICT (modify/delete): ${f} deleted in ${deleted} and modified in ${modified}.  Version ${modified} of ${f} left in tree.`,
        )
      }
    }
  }
  c.out('Automatic merge failed; fix conflicts and then commit the result.')
}

/** Files both sides changed and differ (the set that prints "Auto-merging"). */
function autoMergedFor(base: Tree, ours: Tree, theirs: Tree): string[] {
  const out: string[] = []
  const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])
  for (const f of Array.from(paths).sort()) {
    const o = get(ours, f, DELETED)
    const t = get(theirs, f, DELETED)
    const b = get(base, f, DELETED)
    if (o !== b && t !== b && o !== t) out.push(f)
  }
  return out
}

registerGit('merge', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  let noFf = false
  let squash = false
  let abort = false
  let cont = false
  let message: string | null = null
  const pos: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--no-ff') noFf = true
    else if (a === '--squash') squash = true
    else if (a === '--abort') abort = true
    else if (a === '--continue' || a === '--cont') cont = true
    else if (a === '-m' || a === '--message') {
      if (i + 1 >= argv.length) throw new GitError(`error: option '${a}' requires a value`)
      message = argv[i + 1]
      i++
    } else if (a.startsWith('-')) {
      throw new GitError(`error: unknown option '${a.replace(/^--/, '')}'`)
    } else pos.push(a)
  }

  const work = workdir(ctx.w)
  const index = wt.index

  // --abort / --continue act on the pending merge (checked first: abort must be
  // able to clean up an in-progress merge even with conflicts outstanding).
  if (abort || cont) {
    if (!wt.pending) {
      throw new GitError(
        abort
          ? 'fatal: There is no merge to abort (MERGE_HEAD missing).'
          : 'fatal: There is no merge in progress (MERGE_HEAD missing).',
      )
    }
    if (abort) {
      const origTree = repo.commits[wt.pending.origHead].tree
      for (const f of Object.keys(work)) delete work[f]
      for (const f of Object.keys(origTree)) work[f] = origTree[f]
      wt.index = { ...origTree }
      if (wt.head.type === 'branch') repo.branches[wt.head.name] = wt.pending.origHead
      else wt.head = { type: 'detached', commit: wt.pending.origHead }
      wt.pending = null
      ctx.note('Aborted the merge; restored the pre-merge state')
      return
    }
    // --continue: conclude a fully-resolved merge.
    if (wt.pending.conflicts.length > 0) {
      throw new GitError('error: Committing is not possible because you have unmerged files.')
    }
    concludeMerge(ctx, repo, wt, message ?? wt.pending.message, wt.pending.theirs, { ...wt.index }, true)
    return
  }

  // Unmerged files block starting a new merge.
  if (wt.pending && wt.pending.conflicts.length > 0) {
    throw new GitError('error: Merging is not possible because you have unmerged files.')
  }

  // A concluded-but-uncommitted merge must be committed first.
  if (wt.pending) {
    throw new GitError(
      'fatal: You have not concluded your merge (MERGE_HEAD exists).',
      ['Please, commit your changes before you merge.'],
    )
  }

  if (pos.length === 0) throw new GitError('fatal: No remote for the current branch.')
  if (pos.length > 1) throw new GitError('fatal: too many arguments')
  const target = pos[0]
  const theirSha = resolveRev(repo, wt, target)
  const curSha = headCommit(repo, wt)
  if (theirSha === null || curSha === null) {
    throw new GitError(`merge: ${target} - not something we can merge`)
  }

  const baseTree: Tree = repo.commits[curSha].tree
  const theirTree: Tree = repo.commits[theirSha].tree
  const labels = { ours: 'HEAD', theirs: target }

  const upToDate = isAncestor(repo, theirSha, curSha)
  const isFastForward = !upToDate && isAncestor(repo, curSha, theirSha)
  const fastPath = isFastForward && !noFf && !squash

  // The post-merge result tree for every shape (up-to-date, ff, 3-way).
  let resultTree: Tree
  let conflicts: string[] = []
  let kinds: Record<string, ConflictKind> = {}
  let autoMerged: string[] = []
  const md: Record<string, { deleted: string; modified: string }> = {}
  let mergeIndex: Tree | null = null
  if (upToDate) {
    resultTree = theirTree
  } else if (fastPath) {
    resultTree = theirTree
  } else {
    const mb = mergeBase(repo, curSha, theirSha)
    if (mb === null) throw new GitError('fatal: refusing to merge unrelated histories')
    const bTree = repo.commits[mb].tree
    const res = mergeTrees(bTree, baseTree, theirTree, labels)
    resultTree = res.workdir
    conflicts = res.conflicts
    kinds = res.kinds
    autoMerged = autoMergedFor(bTree, baseTree, theirTree)
    for (const f of conflicts) {
      if (kinds[f] !== 'modify/delete') continue
      const inOurs = Object.hasOwn(baseTree, f)
      md[f] = inOurs ? { deleted: target, modified: 'HEAD' } : { deleted: 'HEAD', modified: target }
    }
    mergeIndex = res.tree
  }

  // Refuse local changes the merge would overwrite. git 2.53 wording:
  // ff -> tab list, "Please commit … stash them", "Aborting", then "Updating a..b".
  // non-ff with a staged-dirty file -> 2-space staged list, "Merge with strategy ort failed."
  // non-ff workdir-only-dirty -> tab list, "Please commit … stash them", "Aborting", then the failure line.
  const dirty = dirtyByMerge(baseTree, index, work, resultTree)
  if (dirty.staged.length > 0 || dirty.workdir.length > 0) {
    const lines: string[] = []
    lines.push('error: Your local changes to the following files would be overwritten by merge:')
    if (fastPath) {
      for (const f of [...dirty.staged, ...dirty.workdir]) lines.push(`\t${f}`)
      lines.push('Please commit your changes or stash them before you merge.')
      lines.push('Aborting')
      lines.push(`Updating ${curSha}..${theirSha}`)
    } else if (dirty.staged.length > 0) {
      for (const f of dirty.staged) lines.push(`  ${f}`)
      lines.push('Merge with strategy ort failed.')
    } else {
      for (const f of dirty.workdir) lines.push(`\t${f}`)
      lines.push('Please commit your changes or stash them before you merge.')
      lines.push('Aborting')
      lines.push('Merge with strategy ort failed.')
    }
    throw new GitError(lines, [])
  }
  // Refuse untracked files the merge would create.
  const untracked: string[] = []
  for (const f of Array.from(new Set(Object.keys(work))).sort()) {
    if (!Object.hasOwn(baseTree, f) && !Object.hasOwn(index, f) && Object.hasOwn(resultTree, f)) {
      untracked.push(f)
    }
  }
  if (untracked.length > 0) {
    throw new GitError(
      [
        'error: The following untracked working tree files would be overwritten by merge:',
        ...untracked.map((f) => `\t${f}`),
        'Please move or remove them before you merge.',
        'Aborting',
      ],
      [],
    )
  }

  // Already up to date: the target is an ancestor of (or equal to) HEAD.
  if (upToDate) {
    ctx.out('Already up to date.')
    ctx.note('Already up to date.')
    return
  }

  // Apply the merge to the working tree (preserving untouched local changes).
  ctx.w.files[ctx.w.cwd] = applyToWorkdir(baseTree, work, resultTree)

  if (conflicts.length > 0) {
    reportConflicts(ctx, autoMerged, conflicts, kinds, md)
    // The index keeps the base content for conflicted paths (per the tree merge).
    wt.index = { ...(mergeIndex ?? resultTree) }
    wt.pending = {
      type: 'merge',
      theirs: theirSha,
      message: message ?? defaultMergeMessage(repo, wt, target, theirSha),
      conflicts,
      origHead: curSha,
      base: mergeBase(repo, curSha, theirSha) ?? curSha,
      preWork: null,
    }
    ctx.note(`Merge conflicts in ${conflicts.length} file${conflicts.length === 1 ? '' : 's'}`)
    return
  }

  if (fastPath) {
    ctx.out(`Updating ${curSha}..${theirSha}`)
    ctx.out('Fast-forward')
    wt.index = { ...theirTree }
    if (wt.head.type === 'branch') repo.branches[wt.head.name] = theirSha
    else wt.head = { type: 'detached', commit: theirSha }
    ctx.note(`Fast-forwarded ${wt.head.type === 'branch' ? wt.head.name : 'HEAD'} to ${theirSha}`)
    return
  }

  if (squash) {
    wt.index = { ...resultTree }
    ctx.out('Squash commit -- not updating HEAD')
    ctx.note('Squashed the merge into the index and workdir (no commit made)')
    return
  }

  // Clean non-fast-forward merge: create the two-parent merge commit.
  ctx.out("Merge made by the 'ort' strategy.")
  concludeMerge(
    ctx,
    repo,
    wt,
    message ?? defaultMergeMessage(repo, wt, target, theirSha),
    theirSha,
    { ...resultTree },
    false,
  )
})

/** Records the merge commit (parents [ours, theirs]) at `tree` and points HEAD at it. */
function concludeMerge(
  ctx: Ctx,
  repo: Repo,
  wt: WorktreeState,
  msg: string,
  theirs: Sha | null,
  tree: Tree,
  printCommitLine: boolean,
): void {
  const head = headCommit(repo, wt)
  if (head === null) throw new GitError('fatal: not a valid object name: HEAD')
  const parents: Sha[] = theirs === null ? [head] : [head, theirs]
  const id = commitId(
    seedFor(parents, tree, msg, ctx.w.clock),
    (c) => Object.hasOwn(repo.commits, c) && c !== head,
  )
  const commit: Commit = { id, parents, message: msg, author: AUTHOR, time: ctx.w.clock, tree }
  repo.commits[id] = commit
  if (wt.head.type === 'branch') repo.branches[wt.head.name] = id
  else wt.head = { type: 'detached', commit: id }
  wt.index = { ...tree }
  wt.pending = null
  const branch = wt.head.type === 'branch' ? wt.head.name : 'detached HEAD'
  if (printCommitLine) ctx.out(`[${branch} ${id}] ${msg.split('\n')[0]}`)
  ctx.note(`Merged into ${branch} (${id})`)
}