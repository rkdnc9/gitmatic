import { GitError } from '../errors'
import { registerGit } from '../run'
import type { Ctx } from '../run'
import { resolveRev } from '../revs'
import type { Repo } from '../types'
import { requireRepo } from '../world'
import { performSwitch } from './checkout'

function printDetached(ctx: Ctx, repo: Repo, sha: string): void {
  ctx.out(`You are in 'detached HEAD' state.`)
  ctx.out(`HEAD is now at ${sha} ${repo.commits[sha]?.message.split('\n')[0] ?? ''}`)
}

registerGit('switch', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  let create = false
  let detach = false
  const pos: string[] = []
  for (const a of argv) {
    if (a === '-c' || a === '--create') create = true
    else if (a === '-d' || a === '--detach') detach = true
    else if (a.startsWith('-') && a !== '-') {
      throw new GitError(`error: unknown option '${a.replace(/^-+/, '')}'`)
    } else {
      pos.push(a)
    }
  }
  if (pos.length > (create ? 2 : 1)) throw new GitError('fatal: missing branch or commit argument')

  const headSha = wt.head.type === 'branch' ? (repo.branches[wt.head.name] ?? null) : wt.head.commit
  if (pos.length > (create ? 2 : 1)) throw new GitError('fatal: missing branch or commit argument')
  if (create) {
    const name = pos[0]
    if (!name) throw new GitError('fatal: missing branch name')
    if (Object.hasOwn(repo.branches, name)) throw new GitError(`fatal: a branch named '${name}' already exists`)
    const start = pos[1] ?? (wt.head.type === 'branch' ? wt.head.name : 'HEAD')
    const sha = resolveRev(repo, wt, start)
    if (sha === null) throw new GitError(`fatal: not a valid object name: '${start}'`)
    repo.branches[name] = sha
    performSwitch(ctx, { type: 'branch', name }, sha)
    ctx.out(`Switched to a new branch '${name}'`)
    ctx.note(`Created and switched to branch '${name}'`)
    return
  }

  if (detach) {
    const rev = pos[0]
    const sha = rev ? resolveRev(repo, wt, rev) : headSha
    if (sha === null) throw new GitError(`fatal: invalid reference: ${rev}`)
    performSwitch(ctx, { type: 'detached', commit: sha }, sha)
    printDetached(ctx, repo, sha)
    ctx.note(`Detached HEAD at ${sha}`)
    return
  }

  const rev = pos[0]
  if (!rev) throw new GitError('fatal: missing branch or commit argument')

  if (Object.hasOwn(repo.branches, rev)) {
    if (wt.head.type === 'branch' && wt.head.name === rev) {
      ctx.out(`Already on '${rev}'`)
      ctx.note(`Already on branch '${rev}'`)
      return
    }
    performSwitch(ctx, { type: 'branch', name: rev }, repo.branches[rev])
    ctx.out(`Switched to branch '${rev}'`)
    ctx.note(`Switched to branch '${rev}'`)
    return
  }
  const sha = resolveRev(repo, wt, rev)
  if (sha !== null) {
    throw new GitError(
      `fatal: a branch is expected, got commit '${sha}'`,
      [`If you want to detach HEAD at the commit, try again with the --detach option.`],
    )
  }
  throw new GitError(`fatal: invalid reference: ${rev}`)
})