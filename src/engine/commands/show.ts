import { GitError } from '../errors'
import { registerGit } from '../run'
import { resolveRev } from '../revs'
import type { Repo, Tree, WorktreeState } from '../types'
import { unifiedDiff } from '../textDiff'
import { requireRepo } from '../world'

const AUTHOR = 'You <you@gitmatic.dev>'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dateLine(time: number): string {
  // gitmatic's clock counts commands; render a believable UTC timestamp for that instant.
  const d = new Date(time * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`
}

/** Decorations like `(HEAD -> main, feature)` — same as git log's decorate=short. */
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

function treeOf(repo: Repo, id: string | null): Tree {
  return id !== null ? (repo.commits[id].tree ?? {}) : {}
}

registerGit('show', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  const rev = argv[0] ?? 'HEAD'
  const id = resolveRev(repo, wt, rev)
  if (id === null) {
    throw new GitError(
      `fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`,
    )
  }
  const c = repo.commits[id]

  ctx.out(`commit ${c.id}${decorate(repo, wt, c.id)}`)
  ctx.out(`Author: ${AUTHOR}`)
  ctx.out(`Date:   ${dateLine(c.time)}`)
  ctx.out('')
  ctx.out(c.message.split('\n').map((l) => `    ${l}`).join('\n'))
  ctx.out('')

  const parent = treeOf(repo, c.parents[0] ?? null)
  const current = treeOf(repo, c.id)
  for (const path of Array.from(new Set([...Object.keys(parent), ...Object.keys(current)])).sort()) {
    const before = Object.hasOwn(parent, path) ? parent[path] : null
    const after = Object.hasOwn(current, path) ? current[path] : null
    if (before === after) continue
    for (const line of unifiedDiff(path, before, after)) ctx.out(line.text, line.tone)
  }
})