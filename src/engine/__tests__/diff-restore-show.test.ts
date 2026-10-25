import { describe, expect, it } from 'vitest'
import { exec, text } from '../testing'
import '../commands'

function setup(): string[] {
  return ['git init', 'echo "a" > a.txt', 'git add a.txt', 'git commit -m "first save"']
}

describe('git diff', () => {
  it('shows workdir changes vs index; empty after add, then in --staged', () => {
    const r = exec([...setup(), 'echo "a2" > a.txt', 'git diff'])
    const d = text(r.last)
    expect(d).toContain('diff --git a/a.txt b/a.txt')
    expect(d).toContain('-a')
    expect(d).toContain('+a2')

    const r2 = exec([...setup(), 'echo "a2" > a.txt', 'git add a.txt', 'git diff'])
    expect(text(r2.last)).toBe('')

    const r3 = exec([...setup(), 'echo "a2" > a.txt', 'git add a.txt', 'git diff --staged'])
    const d3 = text(r3.last)
    expect(d3).toContain('diff --git a/a.txt b/a.txt')
    expect(d3).toContain('-a')
    expect(d3).toContain('+a2')
  })

  it('--cached is an alias for --staged', () => {
    const r = exec([...setup(), 'echo "a2" > a.txt', 'git add a.txt', 'git diff --cached'])
    expect(text(r.last)).toContain('+a2')
  })

  it('shows a new file against /dev/null', () => {
    const r = exec([...setup(), 'echo "n" > new.txt', 'git add new.txt', 'git diff --staged'])
    const d = text(r.last)
    expect(d).toContain('diff --git a/new.txt b/new.txt')
    expect(d).toContain('--- /dev/null')
    expect(d).toContain('+++ b/new.txt')
    expect(d).toContain('+n')
  })

  it('shows a deletion with --- a/path and +++ /dev/null', () => {
    const r = exec([...setup(), 'rm a.txt', 'git add a.txt', 'git diff --staged'])
    const d = text(r.last)
    expect(d).toContain('--- a/a.txt')
    expect(d).toContain('+++ /dev/null')
    expect(d).toContain('-a')
  })

  it('diff between two revs shows the tree delta', () => {
    const r = exec([
      ...setup(),
      'echo "b" > b.txt',
      'git add b.txt',
      'git commit -m "second"',
      'git diff HEAD~1 HEAD',
    ])
    const d = text(r.last)
    expect(d).toContain('diff --git a/b.txt b/b.txt')
    expect(d).toContain('--- /dev/null')
    expect(d).toContain('+++ b/b.txt')
    expect(d).toContain('+b')
  })

  it('-- path limits the diff to that file', () => {
    const r = exec([
      ...setup(),
      'echo "b" > b.txt',
      'echo "a2" > a.txt',
      'git add .',
      'git diff HEAD -- a.txt',
    ])
    const d = text(r.last)
    expect(d).toContain('diff --git a/a.txt b/a.txt')
    expect(d).not.toContain('b/b.txt')
  })

  it('no differences means no output', () => {
    const r = exec([...setup(), 'git diff'])
    expect(text(r.last)).toBe('')
  })

  it('unborn HEAD errors with the ambiguous-argument message', () => {
    const r = exec(['git init', 'git diff HEAD'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe(
      "fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.",
    )
  })

  it('unknown rev errors like git', () => {
    const r = exec([...setup(), 'git diff missing-rev'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe(
      "fatal: ambiguous argument 'missing-rev': unknown revision or path not in the working tree.",
    )
  })

  it('does not error for an unknown path (git allows it)', () => {
    const r = exec([...setup(), 'git diff -- nope.txt'])
    expect(r.last.ok).toBe(true)
    expect(text(r.last)).toBe('')
  })
})

describe('git restore', () => {
  it('discards unstaged workdir changes', () => {
    const r = exec([...setup(), 'echo "a2" > a.txt', 'git restore a.txt', 'git diff'])
    expect(r.last.ok).toBe(true)
    expect(text(r.last)).toBe('')
  })

  it('--staged unstages; workdir keeps the change', () => {
    const r = exec([
      ...setup(),
      'echo "a2" > a.txt',
      'git add a.txt',
      'git restore --staged a.txt',
      'git diff --staged',
    ])
    expect(r.last.ok).toBe(true)
    expect(text(r.last)).toBe('')

    const r2 = exec(
      [...setup(), 'echo "a2" > a.txt', 'git add a.txt', 'git restore --staged a.txt', 'git diff'],
      r.world,
    )
    expect(text(r2.last)).toContain('-a')
    expect(text(r2.last)).toContain('+a2')
  })

  it('removes a newly-added file from the index when HEAD has no such file', () => {
    const r = exec([
      ...setup(),
      'echo "n" > n.txt',
      'git add n.txt',
      'git restore --staged n.txt',
    ])
    expect(r.last.ok).toBe(true)
    expect(r.world.repo!.worktrees['/project'].index).toEqual({ 'a.txt': 'a\n' })
    expect(r.world.files['/project']['n.txt']).toBe('n\n')
  })

  it('restores workdir from --source=<rev>', () => {
    const r = exec([
      ...setup(),
      'echo "a2" > a.txt',
      'git add a.txt',
      'git commit -m "second"',
      'echo "a3" > a.txt',
      'git restore --source=HEAD~1 a.txt',
    ])
    expect(r.last.ok).toBe(true)
    expect(r.world.files['/project']['a.txt']).toBe('a\n')
  })

  it('restores the staged content from --source=<rev> into the index', () => {
    const r = exec([
      ...setup(),
      'echo "a2" > a.txt',
      'git add a.txt',
      'git commit -m "second"',
      'echo "a3" > a.txt',
      'git restore --staged --source=HEAD~1 a.txt',
      'git diff --staged',
    ])
    expect(r.last.ok).toBe(true)
    expect(text(r.last)).toContain('-a2')
    expect(text(r.last)).toContain('+a')
  })

  it('missing pathspec errors like git', () => {
    const r = exec([...setup(), 'git restore missing.txt'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe(
      "error: pathspec 'missing.txt' did not match any file(s) known to git",
    )
  })

  it('no path is an error', () => {
    const r = exec([...setup(), 'git restore'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe('fatal: you must specify path(s) to restore')
  })

  it('sets a note (state-changing command)', () => {
    const r = exec([...setup(), 'echo "a2" > a.txt', 'git restore a.txt'])
    expect(r.last.ok).toBe(true)
    expect(r.last.note).toBeTruthy()
    expect(r.last.note!.length).toBeLessThanOrEqual(120)
  })
})

describe('git show', () => {
  it('shows HEAD commit with message and diff', () => {
    const r = exec([...setup(), 'git show HEAD'])
    const d = text(r.last)
    expect(d).toContain('commit ')
    expect(d).toContain('Author: You <you@gitmatic.dev>')
    expect(d).toContain('Date:   ')
    expect(d).toContain('first save')
    expect(d).toContain('diff --git a/a.txt b/a.txt')
    expect(d).toContain('+a')
  })

  it('defaults to HEAD and shows the diff vs the first parent', () => {
    const r = exec([
      ...setup(),
      'echo "a2" > a.txt',
      'git add a.txt',
      'git commit -m "second"',
      'git show',
    ])
    const d = text(r.last)
    expect(d).toContain('second')
    expect(d).toContain('-a')
    expect(d).toContain('+a2')
    expect(d).not.toContain('first save')
  })

  it('shows a specific rev', () => {
    const r = exec([
      ...setup(),
      'echo "a2" > a.txt',
      'git add a.txt',
      'git commit -m "second"',
      'git show HEAD~1',
    ])
    const d = text(r.last)
    expect(d).toContain('first save')
    expect(d).not.toContain('second')
  })

  it('unknown rev errors like git', () => {
    const r = exec([...setup(), 'git show missing-rev'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe(
      "fatal: ambiguous argument 'missing-rev': unknown revision or path not in the working tree.",
    )
  })

  it('unborn HEAD errors like git', () => {
    const r = exec(['git init', 'git show'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe(
      "fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.",
    )
  })
})