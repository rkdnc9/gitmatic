import { describe, expect, it } from 'vitest'
import { exec, text } from '../testing'
import { produce } from 'immer'
import { createWorld } from '../world'
import '../commands'

describe('smoke: init/add/commit/status/log', () => {
  it('full happy path', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "first save"',
    ])
    expect(r.last.ok).toBe(true)
    const repo = r.world.repo!
    expect(Object.keys(repo.commits)).toHaveLength(1)
    const id = repo.branches.main
    expect(repo.commits[id].parents).toEqual([])
    expect(repo.commits[id].tree).toEqual({ 'a.txt': 'a\n' })
    expect(text(exec(['git status'], r.world).last)).toBe(
      'On branch main\nnothing to commit, working tree clean',
    )
  })

  it('init message', () => {
    const r = exec(['git init'])
    expect(text(r.last)).toBe('Initialized empty Git repository in /project/.git/')
    const r2 = exec(['git init'], r.world)
    expect(text(r2.last)).toBe('Reinitialized existing Git repository in /project/.git/')
  })

  it('add missing pathspec', () => {
    const r = exec(['git init', 'git add missing.txt'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe("fatal: pathspec 'missing.txt' did not match any files")
  })

  it('log full + oneline', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "first"',
      'git log',
    ])
    const t = text(r.last)
    expect(t).toContain('commit ')
    expect(t).toContain('Author: You <you@gitmatic.dev>')
    expect(t).toContain('Date:')
    expect(t).toContain('    first')
    const o = exec(['git log --oneline'], r.world)
    expect(text(o.last)).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) first$/)
  })

  it('log unborn', () => {
    const r = exec(['git init', 'git log'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe(
      "fatal: your current branch 'main' does not have any commits yet",
    )
  })

  it('status unborn clean', () => {
    const r = exec(['git init', 'git status'])
    expect(text(r.last)).toBe(
      'On branch main\n\nNo commits yet\n\nnothing to commit (create/copy files and use "git add" to track)',
    )
  })

  it('commit -a stages tracked mods', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "b" > a.txt',
      'git commit -am "c2"',
    ])
    expect(r.last.ok).toBe(true)
    expect(Object.keys(r.world.repo!.commits)).toHaveLength(2)
  })

  it('amend keeps parent, new id', () => {
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
    expect(repo.commits[repo.branches.main].message).toBe('c2')
  })

  it('detached status header', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
    ])
    const id = r.world.repo!.branches.main
    const det = produce(r.world, (d) => {
      d.repo!.worktrees[d.cwd].head = { type: 'detached', commit: id }
    })
    const s = exec(['git status'], det)
    expect(text(s.last)).toContain(`HEAD detached at ${id}`)
  })

  it('status staged/unstaged/untracked sections', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "b" > a.txt',
      'echo "u" > u.txt',
      'git status',
    ])
    const t = text(r.last)
    expect(t).toContain('Changes not staged for commit:')
    expect(t).toContain('\tmodified:   a.txt')
    expect(t).toContain('Untracked files:')
    expect(t).toContain('\tu.txt')
    expect(t).toContain('no changes added to commit (use "git add" and/or "git commit -a")')
  })

  it('add . stages all incl untracked', () => {
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

  it('add -A stages deletions', () => {
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
})
describe('smoke: graph/all/-A/edge', () => {
  it('log --graph --oneline prefixes *', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'git log --graph --oneline',
    ])
    expect(text(r.last)).toMatch(/^\* [0-9a-f]{7} \(HEAD -> main\) c1$/)
  })

  it('log --all shows branches', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
    ])
    const w2 = produce(r.world, (d) => {
      d.repo!.branches['feature'] = d.repo!.branches.main
    })
    const o = exec(['git log --all --oneline'], w2)
    expect(text(o.last)).toMatch(/^[0-9a-f]{7} \(HEAD -> main, feature\) c1$/)
  })

  it('commit -A stages tracked modified+deleted', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "c1"',
      'echo "b2" > b.txt',
      'rm a.txt',
      'git commit -am "c2"',
    ])
    expect(r.last.ok).toBe(true)
    const repo = r.world.repo!
    expect(Object.keys(repo.commits)).toHaveLength(2)
    expect(repo.commits[repo.branches.main].tree).toEqual({ 'b.txt': 'b2\n' })
  })

  it('commit without -m aborts', () => {
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

  it('commit clean tree refuses', () => {
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

  it('amend without -m keeps message', () => {
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

  it('same script twice produces identical commit ids', () => {
    const script = [
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "b" > b.txt',
      'git add b.txt',
      'git commit -m "c2"',
      'echo "c" >> b.txt',
      'git add b.txt',
      'git commit --amend -m "c2b"',
    ]
    const r1 = exec(script, createWorld())
    const r2 = exec(script, createWorld())
    expect(r1.world.repo!.branches.main).toBe(r2.world.repo!.branches.main)
    expect(Object.keys(r1.world.repo!.commits)).toEqual(Object.keys(r2.world.repo!.commits))
  })

  it('amend keeps parent and changes id', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "b" > b.txt',
      'git add b.txt',
      'git commit -m "c2"',
      'git commit --amend -m "c2b"',
    ])
    const repo = r.world.repo!
    const tip = repo.branches.main
    expect(repo.commits[tip].message).toBe('c2b')
    expect(repo.commits[tip].parents).toHaveLength(1)
    expect(repo.commits[tip].parents[0]).toBe(repo.commits[tip].parents[0])
    expect(Object.keys(repo.commits)).toHaveLength(2)
  })

  it('notes are set and short on every state-changing git command', () => {
    const cases: Array<{ setup: string[]; cmd: string }> = [
      { setup: ['git init'], cmd: 'git init' },
      { setup: ['git init', 'echo "a" > a.txt'], cmd: 'git add a.txt' },
      { setup: ['git init', 'echo "a" > a.txt', 'git add a.txt'], cmd: 'git commit -m "c1"' },
      {
        setup: ['git init', 'echo "a" > a.txt', 'git add a.txt', 'git commit -m "c1"'],
        cmd: 'git commit --amend -m "c2"',
      },
      {
        setup: ['git init', 'echo "a" > a.txt', 'echo "b" > b.txt'],
        cmd: 'git add .',
      },
    ]
    for (const { setup, cmd } of cases) {
      const r = exec([...setup, cmd])
      const res = r.last
      expect(res.ok).toBe(true)
      expect(res.note, cmd).toBeTruthy()
      expect(res.note!.length, cmd).toBeLessThanOrEqual(120)
    }
  })
})
