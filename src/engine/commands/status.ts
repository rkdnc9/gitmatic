import { registerGit } from '../run'
import type { Ctx } from '../run'
import { getStatus, unmergedLabels } from '../status'
import type { StatusEntry } from '../status'
import { requireRepo } from '../world'
import type { Repo, WorktreeState } from '../types'

const LABELS: Record<string, string> = {
  added: 'new file:   ',
  modified: 'modified:   ',
  deleted: 'deleted:    ',
}

// git pads unmerged-path labels to a fixed width so the paths line up.
const UNMERGED: Record<string, string> = {
  'both modified': 'both modified:   ',
  'deleted by us': 'deleted by us:   ',
  'deleted by them': 'deleted by them: ',
  'both added': 'both added:      ',
}

/** Is the worktree on a branch that has commits (vs an unborn branch)? */
function hasHead(repo: Repo, wt: WorktreeState): boolean {
  return wt.head.type === 'detached' || repo.branches[wt.head.name] !== undefined
}

/** Prints one status section: leading blank (except right after the header), title, hints, rows. */
function section(
  c: Ctx,
  needsBlank: boolean,
  title: string,
  hints: string[],
  rows: StatusEntry[],
  key: 'index' | 'work',
): void {
  if (needsBlank) c.out('')
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
  const pending = wt?.pending ?? null
  const mergePending = pending !== null
  const unmerged = entries.filter((e) => e.conflicted)
  const unmergedKind = unmergedLabels(ctx.w)

  if (wt?.head.type === 'branch') ctx.out(`On branch ${wt.head.name}`)
  else if (wt?.head.type === 'detached') ctx.out(`HEAD detached at ${wt.head.commit}`)

  // git's layout: the unborn header is preceded and followed by blank lines; other
  // sections lead with a blank line (except the first one right after the header).
  let needsBlank = unborn
  if (unborn) {
    ctx.out('')
    ctx.out('No commits yet')
  }
  // Conflicted paths appear only in the Unmerged section.
  const clean = entries.filter((e) => !e.conflicted)
  const staged = clean.filter((e) => e.index !== null)
  const unstaged = clean.filter((e) => e.work === 'modified' || e.work === 'deleted')
  const untracked = clean.filter((e) => e.work === 'untracked')
  const unstagedDeletion = unstaged.some((e) => e.work === 'deleted')

  const allQuiet =
    staged.length === 0 &&
    unstaged.length === 0 &&
    untracked.length === 0 &&
    unmerged.length === 0

  if (allQuiet) {
    if (unborn) {
      ctx.out('')
      ctx.out('nothing to commit (create/copy files and use "git add" to track)')
    } else if (mergePending) {
      // All conflicts resolved but the merge is not yet committed.
      ctx.out('')
      ctx.out('All conflicts fixed but you are still merging.')
      ctx.out('  (use "git commit" to conclude merge)')
      ctx.out('')
    } else {
      ctx.out('nothing to commit, working tree clean')
    }
    return
  }

  if (mergePending) {
    if (unmerged.length > 0) {
      ctx.out('You have unmerged paths.')
      ctx.out('  (fix conflicts and run "git commit")')
      ctx.out('  (use "git merge --abort" to abort the merge)')
    } else {
      ctx.out('All conflicts fixed but you are still merging.')
      ctx.out('  (use "git commit" to conclude merge)')
    }
    needsBlank = true
  }

  if (staged.length > 0) {
    section(
      ctx,
      needsBlank || mergePending,
      'Changes to be committed:',
      [committed
        ? '  (use "git restore --staged <file>..." to unstage)'
        : '  (use "git rm --cached <file>..." to unstage)'],
      staged,
      'index',
    )
    needsBlank = true
  }

  if (unmerged.length > 0) {
    if (needsBlank) ctx.out('')
    ctx.out('Unmerged paths:')
    const hasRm = unmerged.some(
      (e) => unmergedKind[e.path] === 'deleted by us' || unmergedKind[e.path] === 'deleted by them',
    )
    ctx.out(
      hasRm
        ? '  (use "git add/rm <file>..." as appropriate to mark resolution)'
        : '  (use "git add <file>..." to mark resolution)',
    )
    for (const e of unmerged) {
      const label = UNMERGED[unmergedKind[e.path] ?? 'both modified'] ?? 'both modified:   '
      ctx.out(`\t${label}${e.path}`)
    }
    needsBlank = true
  }

  if (unstaged.length > 0) {
    section(
      ctx,
      needsBlank,
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
    needsBlank = true
  }

  if (untracked.length > 0) {
    if (needsBlank) ctx.out('')
    ctx.out('Untracked files:')
    ctx.out('  (use "git add <file>..." to include in what will be committed)')
    for (const e of untracked) ctx.out(`\t${e.path}`)
  }

  ctx.out('')
  // git only prints a summary line when nothing is staged.
  if (staged.length === 0) {
    if (unstaged.length > 0 || unmerged.length > 0) {
      ctx.out('no changes added to commit (use "git add" and/or "git commit -a")')
    } else if (untracked.length > 0) {
      ctx.out('nothing added to commit but untracked files present (use "git add" to track)')
    }
  }
})