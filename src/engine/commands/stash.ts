import { GitError } from '../errors'
import { commitId } from '../hash'
import { registerGit } from '../run'
import type { Ctx } from '../run'
import { headCommit } from '../revs'
import type { StashEntry, Tree } from '../types'
import { requireRepo, workdir } from '../world'

const SUBCOMMANDS = new Set(['push', 'list', 'pop', 'apply', 'drop'])

function branchName(ctx: Ctx): string {
  const wt = requireRepo(ctx.w).worktrees[ctx.w.cwd]!
  return wt.head.type === 'branch' ? wt.head.name : 'HEAD'
}

function parseStashRef(raw: string): number | null {
  const m = /^stash@\{(\d+)\}$/.exec(raw)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isNaN(n) || n < 0 ? null : n
}

/** Look up a stash entry by ref (default the newest, index 0); null when out of range. */
function stashByRef(
  stash: StashEntry[],
  raw: string | null,
): { entry: StashEntry; index: number } | null {
  const n = raw === null ? 0 : parseStashRef(raw)
  if (n === null || n >= stash.length) return null
  return { entry: stash[n], index: n }
}

/** True when a tracked file has a staged or unstaged local change (untracked never counts). */
function hasTrackedChanges(headTree: Tree, index: Tree, work: Tree): boolean {
  const keys = [...new Set([...Object.keys(headTree), ...Object.keys(index), ...Object.keys(work)])]
  for (const f of keys) {
    if (!Object.hasOwn(headTree, f) && !Object.hasOwn(index, f)) continue
    if (presenceDiff(index[f], headTree[f])) return true
    const effectiveIndex = index[f] !== undefined ? index[f] : headTree[f]
    if (presenceDiff(work[f], effectiveIndex)) return true
  }
  return false
}

function presenceDiff(a: string | undefined, b: string | undefined): boolean {
  if ((a === undefined) !== (b === undefined)) return true
  return a !== undefined && b !== undefined && a !== b
}

/**
 * `git stash [push [-m <msg>]] | list | pop | apply [stash@{n}] | drop [stash@{n}]`.
 * Saves tracked index+workdir changes against HEAD; untracked files are never stashed
 * (git default). `pop` drops the applied entry; `apply` keeps it. A conflict aborts,
 * keeps the entry and leaves the workdir untouched.
 */
registerGit('stash', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt)
    throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  let sub: string | null = null
  const rest: string[] = []
  for (const a of argv) {
    if (sub === null && SUBCOMMANDS.has(a)) sub = a
    else if (sub === null && !a.startsWith('-'))
      throw new GitError(
        `fatal: subcommand wasn't specified; 'push' can't be assumed due to unexpected token '${a}'`,
      )
    else rest.push(a)
  }
  if (sub === null) sub = 'push'

  // `push -m <msg>` / `push --message=<msg>`
  let message: string | null = null
  let ref: string | null = null
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if ((sub === 'push' || sub === 'list') && (a === '-m' || a === '--message')) {
      if (i + 1 >= rest.length) throw new GitError(`error: option '${a}' requires a value`)
      message = rest[i + 1]
      i++
    } else if (sub === 'push' && a.startsWith('--message=')) {
      message = a.slice('--message='.length)
    } else if (sub === 'push' && a.startsWith('-m') && a.length > 2) {
      message = a.slice(2)
    } else if (sub === 'apply' || sub === 'pop' || sub === 'drop') {
      ref = a
    }
  }

  if (sub === 'list') {
    for (let i = 0; i < repo.stash.length; i++) ctx.out(`stash@{${i}}: ${repo.stash[i].message}`)
    return
  }

  if (sub === 'push') {
    const headSha = headCommit(repo, wt)
    if (headSha === null)
      throw new GitError('You do not have the initial commit yet', [
        'Use "git add <file>" to add the files to git that should be committed.',
        'then run "git stash" again',
      ])
    const headTree: Tree = repo.commits[headSha].tree ?? {}
    const work = workdir(ctx.w)
    if (!hasTrackedChanges(headTree, wt.index, work)) {
      ctx.out('No local changes to save')
      return
    }
    const trackedWork: Tree = {}
    for (const f of Object.keys(work))
      if (Object.hasOwn(headTree, f) || Object.hasOwn(wt.index, f)) trackedWork[f] = work[f]
    const branch = branchName(ctx)
    const msg =
      message !== null
        ? `On ${branch}: ${message}`
        : `WIP on ${branch}: ${headSha.slice(0, 7)} ${repo.commits[headSha].message.split('\n')[0]}`
    const entry: StashEntry = {
      id: commitId(
        [
          msg,
          headSha,
          JSON.stringify(wt.index),
          JSON.stringify(trackedWork),
          String(ctx.w.clock),
        ].join('|'),
        (c) => Object.hasOwn(repo.commits, c),
      ),
      message: msg,
      base: headSha,
      index: { ...wt.index },
      workdir: trackedWork,
      branch,
    }
    repo.stash.unshift(entry)
    wt.index = { ...headTree }
    const newWork: Tree = { ...headTree }
    for (const f of Object.keys(work)) if (!Object.hasOwn(headTree, f)) newWork[f] = work[f]
    ctx.w.files[ctx.w.cwd] = newWork
    ctx.out(`Saved working directory and index state ${msg}`)
    ctx.note('Saved your changes to the stash and cleared them')
    return
  }

  if (sub === 'drop') {
    if (repo.stash.length === 0) throw new GitError('error: No stash entries found.')
    const found = stashByRef(repo.stash, ref)
    if (found === null)
      throw new GitError(
        ref !== null ? `error: ${ref} is not a valid reference` : 'error: No stash entries found.',
      )
    const entry = found.entry
    repo.stash.splice(found.index, 1)
    ctx.out(`Dropped refs/${ref === null ? `stash@{${found.index}}` : ref} (${entry.id})`)
    ctx.note('Dropped a stash entry')
    return
  }

  // apply / pop
  if (repo.stash.length === 0) throw new GitError('error: No stash entries found.')
  const found = stashByRef(repo.stash, ref)
  if (found === null)
    throw new GitError(
      ref !== null ? `error: ${ref} is not a valid reference` : 'error: No stash entries found.',
    )
  const { entry } = found
  const baseTree: Tree = repo.commits[entry.base].tree ?? {}
  const headNowSha = headCommit(repo, wt)
  const headNow: Tree = headNowSha ? (repo.commits[headNowSha].tree ?? {}) : {}
  const workNow = workdir(ctx.w)
  const indexNow = wt.index

  // Conflict: the stash changes f vs base, the workdir has a different local change,
  // and the two values differ. Abort: keep the entry, leave the workdir untouched.
  const keys = [
    ...new Set([
      ...Object.keys(baseTree),
      ...Object.keys(entry.index),
      ...Object.keys(entry.workdir),
      ...Object.keys(workNow),
      ...Object.keys(indexNow),
    ]),
  ]
  for (const f of keys) {
    const baseVal = baseTree[f]
    const stashWork = entry.workdir[f] !== undefined ? entry.workdir[f] : entry.index[f]
    if (stashWork === undefined && baseVal !== undefined) continue
    const cur = workNow[f] !== undefined ? workNow[f] : indexNow[f]
    if (cur === undefined || stashWork === undefined) continue
    const stashChanged = presenceDiff(shashTarget(entry.workdir[f], entry.index[f]), baseVal)
    const currentChanged = presenceDiff(cur, headNow[f])
    if (stashChanged && currentChanged && stashWork !== cur) {
      ctx.out(
        'error: Your local changes to the following files would be overwritten by merge:',
        'err',
      )
      ctx.out(`\t${f}`, 'err')
      ctx.out('Please commit your changes or stash them before you merge.', 'err')
      ctx.out('Aborting', 'err')
      if (sub === 'pop') ctx.out('The stash entry is kept in case you need it again.', 'err')
      return
    }
  }

  // Apply the stashed changes to the WORKDIR only, as unstaged changes. A default stash
  // (no --index) does not restore the index: the index stays where it was, and the
  // stashed staged portion comes back as working-tree changes (verified against real git:
  // `stash pop` after a staged change yields ` M f`, never `M  f`, and `diff --cached` is empty).
  const newWork: Tree = { ...workNow }
  for (const f of keys) {
    const baseVal = baseTree[f]
    const eWork = entry.workdir[f]
    const eIdx = entry.index[f]
    const target = eWork !== undefined ? eWork : eIdx
    if (target === undefined) {
      // The stash deleted f (staged or unstaged delete): remove it from the workdir.
      if (baseVal !== undefined) delete newWork[f]
      continue
    }
    if (presenceDiff(target, baseVal)) newWork[f] = target
  }
  // The index is left untouched (real git: default stash pop/apply never restages).
  ctx.w.files[ctx.w.cwd] = newWork
  if (sub === 'pop') {
    repo.stash.splice(found.index, 1)
    ctx.out(`Dropped refs/${ref === null ? `stash@{${found.index}}` : ref} (${entry.id})`)
    ctx.note('Restored the stash and removed it')
  } else {
    ctx.note('Restored the stash (entry kept)')
  }
})

/** The stash's intended work value for f: workdir value, falling back to the index value. */
function shashTarget(workVal: string | undefined, idxVal: string | undefined): string | undefined {
  return workVal !== undefined ? workVal : idxVal
}
