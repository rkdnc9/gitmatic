import { GitError } from '../errors'
import { registerGit } from '../run'
import type { Ctx } from '../run'
import { headCommit, isAncestor } from '../revs'
import type { Repo, WorktreeState } from '../types'
import { requireRepo } from '../world'

/**
 * Lists every branch, `* `-marking the current one. When HEAD is detached, git
 * prints a `* (HEAD detached at <sha>)` line first, then the branch list.
 */
function listBranches(ctx: Ctx, repo: Repo, wt: WorktreeState): void {
  const names = Object.keys(repo.branches).sort()
  if (wt.head.type === 'detached') {
    ctx.out(`* (HEAD detached at ${wt.head.commit})`)
  }
  const width = Math.max(1, ...names.map((n) => n.length))
  for (const name of names) {
    const star = wt.head.type === 'branch' && wt.head.name === name
    ctx.out(`${star ? '* ' : '  '}${name.padEnd(width)}`)
  }
}

registerGit('branch', (ctx, argv) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  let del = false
  let force = false
  let merge = false
  const pos: string[] = []
  for (const a of argv) {
    if (a === '-d' || a === '--delete') del = true
    else if (a === '-D' || a === '--force') { del = true; force = true }
    else if (a === '-m' || a === '--move') merge = true
    else if (a === '--list' || a === '-a' || a === '-v') { /* accepted; list below */ }
    else if (a.startsWith('-') && a !== '-' && a.length > 1) {
      throw new GitError(`error: unknown option '${a.replace(/^-+/, '')}'`)
    } else {
      pos.push(a)
    }
  }

  if (pos.length === 0 && !del && !merge) {
    listBranches(ctx, repo, wt)
    return
  }

  if (merge) {
    // branch -m <new>  (rename current)  /  branch -m <old> <new>
    if (pos.length === 0) throw new GitError('fatal: branch name required')
    if (pos.length > 2) throw new GitError('fatal: too many arguments for a rename operation')
    const isTwo = pos.length === 2
    const oldName = isTwo ? pos[0] : wt.head.type === 'branch' ? wt.head.name : undefined
    const newName = isTwo ? pos[1] : pos[0]
    if (!oldName || !Object.hasOwn(repo.branches, oldName)) {
      throw new GitError(`fatal: no branch named '${oldName ?? ''}'`)
    }
    if (oldName === newName) return // self-rename: no-op, like git
    if (Object.hasOwn(repo.branches, newName)) throw new GitError(`fatal: a branch named '${newName}' already exists`)
    const tip = repo.branches[oldName]
    delete repo.branches[oldName]
    repo.branches[newName] = tip
    if (wt.head.type === 'branch' && wt.head.name === oldName) wt.head = { type: 'branch', name: newName }
    ctx.note(`Renamed branch '${oldName}' to '${newName}'`)
    return
  }

  if (del) {
    if (pos.length !== 1) throw new GitError('fatal: missing branch name')
    const name = pos[0]
    if (wt.head.type === 'branch' && wt.head.name === name) {
      throw new GitError(`error: cannot delete branch '${name}' used by worktree at '${ctx.w.cwd}'`)
    }
    if (!Object.hasOwn(repo.branches, name)) throw new GitError(`fatal: branch '${name}' not found`)
    if (!force) {
      const cur = headCommit(repo, wt)
      // Fully merged means the branch tip is reachable from HEAD.
      if (cur === null || !isAncestor(repo, repo.branches[name], cur)) {
        throw new GitError(
          [`error: the branch '${name}' is not fully merged`],
          [`Delete the branch '${name}' with -D.`],
        )
      }
    }
    delete repo.branches[name]
    ctx.note(`Deleted branch '${name}'`)
    return
  }

  // git branch <name> [<start-point>]
  if (pos.length === 0) throw new GitError('fatal: missing branch name')
  const name = pos[0]
  if (Object.hasOwn(repo.branches, name)) throw new GitError(`fatal: a branch named '${name}' already exists`)
  const cur = headCommit(repo, wt)
  if (cur === null) {
    throw new GitError(`fatal: not a valid object name: '${wt.head.type === 'branch' ? wt.head.name : 'HEAD'}'`)
  }
  repo.branches[name] = cur
  ctx.note(`Created branch '${name}'`)
})