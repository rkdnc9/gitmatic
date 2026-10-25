import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { exec } from '../testing'
import {
  headCommit,
  isAncestor,
  mergeBase,
  reachable,
  resolveRev,
} from '../revs'
import type { Commit, WorktreeState } from '../types'
import '../commands'

/** Builds a 3-commit linear history and returns {repo, wt, ids}. */
function linearHistory() {
  const { world } = exec([
    'git init',
    'echo "a" > a.txt',
    'git add a.txt',
    'git commit -m "one"',
    'echo "b" > b.txt',
    'git add b.txt',
    'git commit -m "two"',
    'echo "c" > c.txt',
    'git add c.txt',
    'git commit -m "three"',
  ])
  const repo = world.repo!
  const wt = repo.worktrees[world.cwd]
  const ids: string[] = []
  let cur: string | undefined = repo.branches.main
  while (cur) {
    ids.unshift(cur)
    cur = repo.commits[cur].parents[0]
  }
  return { repo, wt, ids }
}

describe('headCommit', () => {
  it('returns the branch tip, or null on an unborn branch', () => {
    const { repo, wt, ids } = linearHistory()
    expect(headCommit(repo, wt)).toBe(ids[2])
    const unborn = exec(['git init']).world
    expect(headCommit(unborn.repo!, unborn.repo!.worktrees['/project'])).toBeNull()
  })

  it('returns the commit id when detached', () => {
    const { repo, wt, ids } = linearHistory()
    const det: WorktreeState = { ...wt, head: { type: 'detached', commit: ids[1] } }
    expect(headCommit(repo, det)).toBe(ids[1])
  })
})

describe('resolveRev', () => {
  it('resolves HEAD, branch names and prefixes', () => {
    const { repo, wt, ids } = linearHistory()
    expect(resolveRev(repo, wt, 'HEAD')).toBe(ids[2])
    expect(resolveRev(repo, wt, 'main')).toBe(ids[2])
    expect(resolveRev(repo, wt, ids[1])).toBe(ids[1])
    expect(resolveRev(repo, wt, ids[1].slice(0, 4))).toBe(ids[1])
    expect(resolveRev(repo, wt, ids[0].slice(0, 4))).toBe(ids[0])
  })

  it('resolves ~n, ^ and ^2', () => {
    const { repo, wt, ids } = linearHistory()
    expect(resolveRev(repo, wt, 'HEAD~1')).toBe(ids[1])
    expect(resolveRev(repo, wt, 'HEAD~2')).toBe(ids[0])
    expect(resolveRev(repo, wt, 'HEAD^')).toBe(ids[1])
    expect(resolveRev(repo, wt, 'HEAD^^')).toBe(ids[0])
    expect(resolveRev(repo, wt, `${ids[2]}~1`)).toBe(ids[1])
  })

  it('resolves ^2 as the second parent of a merge commit', () => {
    const { repo, wt } = linearHistory()
    const mergeId = 'a1b2c3d'
    const secondParent = 'beef001'
    const headTip = wt.head.type === 'branch' ? repo.branches[wt.head.name]! : wt.head.commit
    const merge: Commit = {
      id: mergeId,
      parents: [headTip, secondParent],
      message: 'merge',
      author: 'You <you@gitmatic.dev>',
      time: 99,
      tree: {},
    }
    const merged = produce(repo, (d) => {
      d.commits[mergeId] = merge
    })
    expect(resolveRev(merged, wt, `${mergeId}^2`)).toBe(secondParent)
    expect(resolveRev(merged, wt, `${mergeId}^`)).toBe(headTip)
  })

  it('returns null for unknown, garbage and too-short prefixes', () => {
    const { repo, wt, ids } = linearHistory()
    expect(resolveRev(repo, wt, 'nope')).toBeNull()
    expect(resolveRev(repo, wt, 'HEAD~9')).toBeNull()
    expect(resolveRev(repo, wt, 'HEAD~')).toBeNull()
    expect(resolveRev(repo, wt, ids[0].slice(0, 2))).toBeNull() // < 4 chars
    expect(resolveRev(repo, wt, '')).toBeNull()
    expect(resolveRev(repo, wt, 'HEAD^{commit}')).toBeNull()
  })
})

describe('reachable', () => {
  it('collects all ancestors including the tip', () => {
    const { repo, ids } = linearHistory()
    const set = reachable(repo, [ids[2]])
    expect(set).toEqual(new Set(ids))
  })
})

describe('isAncestor', () => {
  it('is true for ancestors and self, false otherwise', () => {
    const { repo, ids } = linearHistory()
    expect(isAncestor(repo, ids[0], ids[2])).toBe(true)
    expect(isAncestor(repo, ids[2], ids[2])).toBe(true)
    expect(isAncestor(repo, ids[2], ids[0])).toBe(false)
  })
})

describe('mergeBase', () => {
  it('finds the common ancestor of two commits', () => {
    const { repo, ids } = linearHistory()
    expect(mergeBase(repo, ids[2], ids[1])).toBe(ids[1])
    expect(mergeBase(repo, ids[2], ids[0])).toBe(ids[0])
    expect(mergeBase(repo, ids[2], ids[2])).toBe(ids[2])
  })
})
