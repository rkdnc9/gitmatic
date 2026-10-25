import { GitError } from '../errors'
import { registerGit } from '../run'
import type { Repo, WorktreeState } from '../types'
import { requireRepo } from '../world'

const AUTHOR = 'You <you@gitmatic.dev>'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dateLine(time: number): string {
  // gitmatic's clock counts commands; render a believable UTC timestamp for that instant.
  const d = new Date(time * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`
}

/** Decorations like `(HEAD -> main, feature)` — git's default decorate=short. */
function decorate(repo: Repo, wt: WorktreeState, id: string): string {
  const parts: string[] = []
  const headTip = wt.head.type === 'branch' ? repo.branches[wt.head.name] : wt.head.commit
  const currentBranch = wt.head.type === 'branch' ? wt.head.name : null
  if (headTip === id) {
    parts.push(currentBranch !== null ? `HEAD -> ${currentBranch}` : 'HEAD')
  }
  const refs: string[] = []
  for (const [name, tip] of Object.entries(repo.branches)) {
    if (tip === id && name !== currentBranch) refs.push(name)
  }
  for (const [name, tag] of Object.entries(repo.tags)) {
    if (tag.target === id) refs.push(`tag: ${name}`)
  }
  parts.push(...refs.sort())
  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

/** Commit ids to show: HEAD chain, plus every branch tip with --all. Newest-first. */
function collect(repo: Repo, wt: WorktreeState, all: boolean): string[] {
  const tips: string[] = []
  const headTip = wt.head.type === 'branch' ? repo.branches[wt.head.name] : wt.head.commit
  if (headTip) tips.push(headTip)
  if (all) {
    for (const tip of Object.values(repo.branches)) {
      if (tip && !tips.includes(tip)) tips.push(tip)
    }
  }
  const seen = new Set<string>()
  const order: string[] = []
  const stack = [...tips]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    order.push(id)
    const c = repo.commits[id]
    if (c) stack.push(...c.parents)
  }
  return order.sort((a, b) => repo.commits[b].time - repo.commits[a].time)
}

registerGit('log', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  let oneline = false
  let all = false
  let graph = false
  for (const a of argv) {
    if (a === '--oneline') oneline = true
    else if (a === '--all') all = true
    else if (a === '--graph') graph = true
    else if (a === '--decorate') { /* git's default */ }
    else if (a.startsWith('-')) throw new GitError(`error: unknown option '${a.replace(/^-+/, '')}'`)
    // Positional revs are out of Task 3 scope; ignore them.
  }

  const branchName = wt.head.type === 'branch' ? wt.head.name : 'HEAD'
  const ids = collect(repo, wt, all)
  if (ids.length === 0) {
    throw new GitError(`fatal: your current branch '${branchName}' does not have any commits yet`)
  }

  for (const id of ids) {
    const c = repo.commits[id]
    if (!c) continue
    const dec = decorate(repo, wt, id)
    const prefix = graph ? '* ' : ''
    const body = '    ' + c.message.split('\n').join('\n    ')
    if (oneline) {
      ctx.out(`${prefix}${id}${dec} ${c.message.split('\n')[0]}`)
    } else {
      ctx.out(`${prefix}commit ${id}${dec}`)
      ctx.out(`${prefix}Author: ${AUTHOR}`)
      ctx.out(`${prefix}Date:   ${dateLine(c.time)}`)
      ctx.out(`${prefix}`)
      ctx.out(`${prefix}${body}`)
      ctx.out(`${prefix}`)
    }
  }
})