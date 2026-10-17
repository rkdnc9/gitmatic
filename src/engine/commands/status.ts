import { registerGit } from '../run'
import type { Ctx } from '../run'
import { getStatus } from '../status'
import type { StatusEntry } from '../status'
import { requireRepo } from '../world'
import type { Repo, WorktreeState } from '../types'

const LABELS: Record<string, string> = {
  added: 'new file:   ',
  modified: 'modified:   ',
  deleted: 'deleted:    ',
}

/** Is `name` an existing branch with commits (vs an unborn branch)? */
function hasHead(repo: Repo, wt: WorktreeState): boolean {
  return wt.head.type === 'detached' || repo.branches[wt.head.name] !== undefined
}

function section(
  c: Ctx,
  title: string,
  hints: string[],
  rows: StatusEntry[],
  key: 'index' | 'work',
): void {
  c.out('')
  c.out(title)
  for (const h of hints) c.out(h)
  for (const e of rows) c.out(`\t${LABELS[e[key]!]}${e.path}`)
}

registerGit('status', (ctx) => {
  const repo = requireRepo(ctx.w)
  const wt = repo.worktrees[ctx.w.cwd]
  const entries = getStatus(ctx.w)
  const committed = wt ? hasHead(repo, wt) : false
  const unborn = wt?.head.type === 'branch' && !committed

  if (wt?.head.type === 'branch') ctx.out(`On branch ${wt.head.name}`)
  else if (wt?.head.type === 'detached') ctx.out(`HEAD detached at ${wt.head.commit}`)
  if (unborn) {
    ctx.out('')
    ctx.out('No commits yet')
  }

  const staged = entries.filter((e) => e.index !== null)
  const unstaged = entries.filter(
    (e) => e.index === null && (e.work === 'modified' || e.work === 'deleted'),
  )
  const untracked = entries.filter((e) => e.work === 'untracked')

  const unstagedDeletion = unstaged.some((e) => e.work === 'deleted')

  if (staged.length === 0 && unstaged.length === 0 && untracked.length === 0) {
    if (unborn) {
      ctx.out('')
      ctx.out('nothing to commit (create/copy files and use "git add" to track)')
    } else {
      ctx.out('nothing to commit, working tree clean')
    }
    return
  }

  if (staged.length > 0) {
    section(
      ctx,
      'Changes to be committed:',
      [committed
        ? '  (use "git restore --staged <file>..." to unstage)'
        : '  (use "git rm --cached <file>..." to unstage)'],
      staged,
      'index',
    )
  }

  if (unstaged.length > 0) {
    section(
      ctx,
      'Changes not staged for commit:',
      [
        unstagedDeletion
          ? '  (use "git add/rm <file>..." to update what will be committed)'
          : '  (use "git add <file>..." to update what will be committed)',
        '  (use "git restore <file>..." to discard changes in working directory)',
      ],
      unstaged,
      'work',
    )
  }

  if (untracked.length > 0) {
    ctx.out('')
    ctx.out('Untracked files:')
    ctx.out('  (use "git add <file>..." to include in what will be committed)')
    for (const e of untracked) ctx.out(`\t${e.path}`)
  }

  ctx.out('')
  // git only prints a summary line when nothing is staged.
  if (staged.length === 0) {
    if (unstaged.length === 0) {
      ctx.out('nothing added to commit but untracked files present (use "git add" to track)')
    } else {
      ctx.out('no changes added to commit (use "git add" and/or "git commit -a")')
    }
  }
})