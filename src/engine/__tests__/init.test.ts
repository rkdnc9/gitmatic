import { describe, expect, it } from 'vitest'
import { exec, text } from '../testing'
import '../commands'

describe('git init', () => {
  it('prints the exact init message and sets up a repo', () => {
    const r = exec(['git init'])
    expect(text(r.last)).toBe('Initialized empty Git repository in /project/.git/')
    const repo = r.world.repo!
    expect(repo.root).toBe('/project')
    expect(repo.commits).toEqual({})
    expect(repo.branches).toEqual({})
    expect(repo.worktrees['/project']).toEqual({
      head: { type: 'branch', name: 'main' },
      index: {},
      pending: null,
    })
  })

  it('re-inits with the exact message', () => {
    const r = exec(['git init', 'git init'])
    expect(text(r.last)).toBe('Reinitialized existing Git repository in /project/.git/')
  })

  it('init sets a note', () => {
    const r = exec(['git init'])
    expect(r.last.note).toBeTruthy()
    expect(r.last.note!.length).toBeLessThanOrEqual(120)
  })

  it('initialises an unborn main branch', () => {
    const r = exec(['git init', 'git status'])
    expect(text(r.last)).toBe(
      'On branch main\n\nNo commits yet\n\nnothing to commit (create/copy files and use "git add" to track)',
    )
  })
})
