import { describe, expect, it } from 'vitest'
import { exec, text } from '../testing'
import '../commands'

describe('git add', () => {
  it('stages new files; status shows them as new file', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git status',
    ])
    expect(text(r.last)).toContain('new file:   a.txt')
    const repo = r.world.repo!
    expect(repo.worktrees['/project'].index).toEqual({ 'a.txt': 'a\n' })
  })

  it('fails with the exact pathspec message for a missing file', () => {
    const r = exec(['git init', 'git add missing.txt'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe("fatal: pathspec 'missing.txt' did not match any files")
  })

  it('git add . stages all workdir files', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'echo "b" > b.txt',
      'git add .',
      'git status',
    ])
    expect(text(r.last)).toContain('new file:   a.txt')
    expect(text(r.last)).toContain('new file:   b.txt')
  })

  it('git add -A stages deletions', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "c1"',
      'rm a.txt',
      'git add -A',
      'git status',
    ])
    expect(text(r.last)).toContain('deleted:    a.txt')
  })

  it('git add <deleted-file> stages its removal', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'rm a.txt',
      'git add a.txt',
      'git status',
    ])
    expect(text(r.last)).toContain('deleted:    a.txt')
  })

  it('git add with no args prints the empty-pathspec message and succeeds', () => {
    const r = exec(['git init', 'git add'])
    expect(r.last.ok).toBe(true)
    expect(text(r.last)).toContain('Nothing specified, nothing added.')
  })

  it('git add sets a note', () => {
    const r = exec(['git init', 'echo "a" > a.txt', 'git add a.txt'])
    expect(r.last.note).toBeTruthy()
    expect(r.last.note!.length).toBeLessThanOrEqual(120)
  })
})

describe('git commit', () => {
  it('commits staged changes and updates main', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "first save"',
    ])
    expect(r.last.ok).toBe(true)
    const repo = r.world.repo!
    expect(repo.branches.main).toBeTruthy()
    const id = repo.branches.main
    expect(Object.keys(repo.commits)).toHaveLength(1)
    expect(repo.commits[id].parents).toEqual([])
    expect(repo.commits[id].tree).toEqual({ 'a.txt': 'a\n' })
    expect(repo.commits[id].message).toBe('first save')
    expect(text(r.last)).toMatch(/^\[main \(root-commit\) [0-9a-f]{7}\] first save$/)
  })

  it('subsequent commits keep the root-commit marker off', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "first"',
      'echo "b" > b.txt',
      'git add b.txt',
      'git commit -m "second"',
    ])
    expect(text(r.last)).toMatch(/^\[main [0-9a-f]{7}\] second$/)
    const repo = r.world.repo!
    expect(Object.keys(repo.commits)).toHaveLength(2)
    const tip = repo.commits[repo.branches.main]
    expect(tip.parents).toEqual([expect.stringMatching(/^[0-9a-f]{7}$/)])
  })

  it('refuses a clean tree with the exact message', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'git commit -m "c2"',
    ])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe('nothing to commit, working tree clean')
  })

  it('refuses unstaged-only changes with the exact message', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "b" > a.txt',
      'git commit -m "c2"',
    ])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe(
      'no changes added to commit (use "git add" and/or "git commit -a")',
    )
  })

  it('aborts on empty message with the exact error and hint', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit',
    ])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe(
      'Aborting commit due to empty commit message.\nUse git commit -m "message"',
    )
  })

  it('commit -a stages tracked modifications only', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "b" > a.txt',
      'git commit -am "c2"',
    ])
    expect(r.last.ok).toBe(true)
    const repo = r.world.repo!
    expect(Object.keys(repo.commits)).toHaveLength(2)
    expect(repo.commits[repo.branches.main].tree).toEqual({ 'a.txt': 'b\n' })
  })

  it('commit -a does not stage new untracked files', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "b" > a.txt',
      'echo "new" > new.txt',
      'git commit -am "c2"',
    ])
    const repo = r.world.repo!
    const tip = repo.commits[repo.branches.main]
    expect(tip.tree).toEqual({ 'a.txt': 'b\n' })
    expect(tip.tree['new.txt']).toBeUndefined()
  })

  it('commit -a stages deletions of tracked files', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "c1"',
      'rm a.txt',
      'git commit -am "c2"',
    ])
    expect(r.last.ok).toBe(true)
    const repo = r.world.repo!
    expect(repo.commits[repo.branches.main].tree).toEqual({ 'b.txt': 'b\n' })
  })

  it('--amend replaces the tip with a new id and keeps parents', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'git commit --amend -m "c2"',
    ])
    expect(r.last.ok).toBe(true)
    const repo = r.world.repo!
    expect(Object.values(repo.commits)).toHaveLength(1)
    const tip = repo.commits[repo.branches.main]
    expect(tip.message).toBe('c2')
    expect(tip.parents).toEqual([])
  })

  it('--amend with no -m keeps the message', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "keep me"',
      'git commit --amend',
    ])
    expect(r.last.ok).toBe(true)
    expect(r.world.repo!.commits[r.world.repo!.branches.main].message).toBe('keep me')
  })

  it('--amend on an unborn branch fails', () => {
    const r = exec(['git init', 'git commit --amend -m "x"'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe('fatal: You have nothing to amend.')
  })

  it('running the same script twice gives identical commit ids', () => {
    const script = [
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "first"',
      'echo "b" > b.txt',
      'git add b.txt',
      'git commit -m "second"',
    ]
    const a = exec(script)
    const b = exec(script)
    expect(Object.keys(a.world.repo!.commits).sort()).toEqual(
      Object.keys(b.world.repo!.commits).sort(),
    )
    expect(a.world.repo!.branches.main).toBe(b.world.repo!.branches.main)
  })

  it('commit sets a short note', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
    ])
    expect(r.last.note).toBeTruthy()
    expect(r.last.note!.length).toBeLessThanOrEqual(120)
  })
})
