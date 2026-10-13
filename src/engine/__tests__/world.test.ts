import { describe, expect, it } from 'vitest'
import { GitError } from '../errors'
import { commitId } from '../hash'
import { createWorld, currentWorktree, requireRepo, workdir, writeFile } from '../world'

describe('world', () => {
  it('createWorld starts in an empty /project with no repo', () => {
    expect(createWorld()).toEqual({
      version: 1,
      cwd: '/project',
      files: { '/project': {} },
      repo: null,
      clock: 0,
    })
  })

  it('writeFile is pure', () => {
    const w = createWorld()
    const w2 = writeFile(w, 'a.txt', 'hi\n')
    expect(workdir(w2)).toEqual({ 'a.txt': 'hi\n' })
    expect(workdir(w)).toEqual({})
  })

  it('currentWorktree is null without a repo; requireRepo throws git’s message', () => {
    const w = createWorld()
    expect(currentWorktree(w)).toBeNull()
    expect(() => requireRepo(w)).toThrow(GitError)
    try {
      requireRepo(w)
    } catch (e) {
      expect((e as GitError).lines).toEqual([
        'fatal: not a git repository (or any of the parent directories): .git',
      ])
    }
  })
})

describe('commitId', () => {
  it('is 7 lowercase hex chars and deterministic', () => {
    const a = commitId('seed', () => false)
    expect(a).toMatch(/^[0-9a-f]{7}$/)
    expect(commitId('seed', () => false)).toBe(a)
    expect(commitId('other', () => false)).not.toBe(a)
  })

  it('re-salts on collision', () => {
    const first = commitId('seed', () => false)
    const second = commitId('seed', (id) => id === first)
    expect(second).toMatch(/^[0-9a-f]{7}$/)
    expect(second).not.toBe(first)
  })
})
