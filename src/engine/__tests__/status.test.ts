import { describe, expect, it } from 'vitest'
import { exec, text } from '../testing'
import '../commands'

describe('git status', () => {
  it('returns empty when there is no repo', () => {
    const r = exec(['git status'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe(
      'fatal: not a git repository (or any of the parent directories): .git',
    )
  })

  it('shows untracked files on an unborn branch', () => {
    const r = exec(['git init', 'echo "a" > a.txt', 'git status'])
    expect(text(r.last)).toBe(
      [
        'On branch main',
        '',
        'No commits yet',
        '',
        'Untracked files:',
        '  (use "git add <file>..." to include in what will be committed)',
        '\ta.txt',
        '',
        'nothing added to commit but untracked files present (use "git add" to track)',
      ].join('\n'),
    )
  })

  it('shows staged new files with the unborn unstage hint', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'echo "u" > u.txt',
      'git add a.txt',
      'git status',
    ])
    expect(text(r.last)).toBe(
      [
        'On branch main',
        '',
        'No commits yet',
        '',
        'Changes to be committed:',
        '  (use "git rm --cached <file>..." to unstage)',
        '\tnew file:   a.txt',
        '',
        'Untracked files:',
        '  (use "git add <file>..." to include in what will be committed)',
        '\tu.txt',
        '',
      ].join('\n'),
    )
  })

  it('shows a clean committed tree', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'git status',
    ])
    expect(text(r.last)).toBe('On branch main\nnothing to commit, working tree clean')
  })

  it('shows modified-unstaged with exact hints', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "b" > a.txt',
      'git status',
    ])
    expect(text(r.last)).toBe(
      [
        'On branch main',
        'Changes not staged for commit:',
        '  (use "git add <file>..." to update what will be committed)',
        '  (use "git restore <file>..." to discard changes in working directory)',
        '\tmodified:   a.txt',
        '',
        'no changes added to commit (use "git add" and/or "git commit -a")',
      ].join('\n'),
    )
  })

  it('shows staged-then-modified as both index and work entries', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "b" > a.txt',
      'git add a.txt',
      'echo "c" > a.txt',
      'git status',
    ])
    const t = text(r.last)
    expect(t).toContain('Changes to be committed:')
    expect(t).toContain('\tmodified:   a.txt')
    expect(t).toContain('Changes not staged for commit:')
    expect(t).toContain('\tmodified:   a.txt')
    // When something is staged, git prints no summary line.
    expect(t).not.toContain('no changes added')
  })

  it('uses the git add/rm hint when deletions are unstaged', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "c1"',
      'rm b.txt',
      'git status',
    ])
    expect(text(r.last)).toContain(
      '  (use "git add/rm <file>..." to update what will be committed)',
    )
    expect(text(r.last)).toContain('\tdeleted:    b.txt')
  })

  it('shows a detached HEAD header', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
    ])
    const id = r.world.repo!.branches.main
    // Detach HEAD by editing the worktree state directly (no checkout yet in Task 3).
    const det = { ...r.world, repo: { ...r.world.repo!, worktrees: { '/project': {
      ...r.world.repo!.worktrees['/project'], head: { type: 'detached' as const, commit: id },
    } } } }
    const s = exec(['git status'], det)
    expect(text(s.last)).toContain(`HEAD detached at ${id}`)
  })

  it('sorts entries by path', () => {
    const r = exec([
      'git init',
      'echo "1" > zz.txt',
      'echo "2" > aa.txt',
      'echo "3" > mm.txt',
      'git status',
    ])
    const t = text(r.last)
    expect(t.indexOf('\taa.txt')).toBeLessThan(t.indexOf('\tmm.txt'))
    expect(t.indexOf('\tmm.txt')).toBeLessThan(t.indexOf('\tzz.txt'))
  })
})
