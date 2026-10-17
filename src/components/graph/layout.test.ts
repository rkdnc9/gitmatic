import { describe, it, expect } from 'vitest'
import { layoutGraph } from './layout'
import type { Repo, WorktreeState, Sha, Commit, Tree } from '../../engine/types'

const EMPTY_TREE: Tree = {}

function commit(id: Sha, message: string, time: number, parents: Sha[] = []): Commit {
  return { id, message, parents, author: 't', time, tree: EMPTY_TREE }
}

function makeRepo(): Repo {
  return {
    root: '/r',
    commits: {},
    branches: {},
    tags: {},
    stash: [],
    worktrees: {},
  }
}

function wt(branch: string): WorktreeState {
  return { head: { type: 'branch', name: branch }, index: {}, pending: null }
}

function detachedWt(sha: Sha): WorktreeState {
  return { head: { type: 'detached', commit: sha }, index: {}, pending: null }
}

describe('layoutGraph', () => {
  it('linear 3 commits: one lane, cols 0..2', () => {
    const repo = makeRepo()
    repo.commits['a'] = commit('a', 'msg-a', 0)
    repo.commits['b'] = commit('b', 'msg-b', 1, ['a'])
    repo.commits['c'] = commit('c', 'msg-c', 2, ['b'])
    repo.branches['main'] = 'c'

    const out = layoutGraph(repo, wt('main'))

    expect(out.cols).toBe(3)
    expect(out.lanes).toBe(1)
    expect(out.detached).toBe(false)
    expect(out.nodes).toHaveLength(3)
    const byCol = new Map(out.nodes.map((n) => [n.col, n]))
    expect(byCol.get(0)!.id).toBe('a')
    expect(byCol.get(1)!.id).toBe('b')
    expect(byCol.get(2)!.id).toBe('c')
    for (const n of out.nodes) {
      expect(n.lane).toBe(0)
    }
    // Head commit marked
    expect(out.nodes.find((n) => n.id === 'c')!.isHead).toBe(true)
    // Edges: c->b, b->a
    expect(out.edges).toEqual([
      { child: 'c', parent: 'b' },
      { child: 'b', parent: 'a' },
    ])
    // Labels
    const mainLabel = out.labels.find((l) => l.kind === 'branch' && l.name === 'main')!
    expect(mainLabel.target).toBe('c')
    expect(mainLabel.current).toBe(true)
    const headLabel = out.labels.find((l) => l.kind === 'head')!
    expect(headLabel.name).toBe('main')
    expect(headLabel.target).toBe('c')
  })

  it('branch + diverged: main lane 0, feature lane 1, merge on lane 0 with 2 edges', () => {
    const repo = makeRepo()
    // a -> b (main), a -> d (feature), merge c = merge(b, d)
    repo.commits['a'] = commit('a', 'msg-a', 0)
    repo.commits['b'] = commit('b', 'msg-b', 1, ['a'])
    repo.commits['c'] = commit('c', 'msg-c', 2, ['b', 'd'])
    repo.commits['d'] = commit('d', 'msg-d', 3, ['a'])
    repo.branches['main'] = 'c'
    repo.branches['feature'] = 'd'

    const out = layoutGraph(repo, wt('main'))

    // col rank by time ascending: a=0, b=1, c=2, d=3
    const node = (id: string) => out.nodes.find((n) => n.id === id)!
    expect(node('a').col).toBe(0)
    expect(node('b').col).toBe(1)
    expect(node('c').col).toBe(2)
    expect(node('d').col).toBe(3)

    // main lane 0: a, b, c. feature lane 1: d
    expect(node('a').lane).toBe(0)
    expect(node('b').lane).toBe(0)
    expect(node('c').lane).toBe(0)
    expect(node('d').lane).toBe(1)
    expect(out.lanes).toBe(2)

    // Merge commit c has 2 edges (first + second parent)
    const edgesFromC = out.edges.filter((e) => e.child === 'c')
    expect(edgesFromC).toEqual([
      { child: 'c', parent: 'b' },
      { child: 'c', parent: 'd' },
    ])

    // Labels
    const featureLabel = out.labels.find((l) => l.kind === 'branch' && l.name === 'feature')!
    expect(featureLabel.target).toBe('d')
    expect(featureLabel.current).toBe(false)
    const mainLabel = out.labels.find((l) => l.kind === 'branch' && l.name === 'main')!
    expect(mainLabel.current).toBe(true)
  })

  it('detached commit gets its own lane and detached: true', () => {
    const repo = makeRepo()
    // main: a -> b. detached commit d on top of b.
    repo.commits['a'] = commit('a', 'msg-a', 0)
    repo.commits['b'] = commit('b', 'msg-b', 1, ['a'])
    repo.commits['d'] = commit('d', 'msg-d', 2, ['b'])
    repo.branches['main'] = 'b'

    const out = layoutGraph(repo, detachedWt('d'))

    expect(out.detached).toBe(true)
    const node = (id: string) => out.nodes.find((n) => n.id === id)!
    // d on its own lane (not shared with main's lane 0)
    expect(node('a').lane).toBe(0)
    expect(node('b').lane).toBe(0)
    expect(node('d').lane).toBe(1)
    expect(out.lanes).toBe(2)
    // d is the head commit
    expect(node('d').isHead).toBe(true)

    // HEAD label targets the commit
    const headLabel = out.labels.find((l) => l.kind === 'head')!
    expect(headLabel.name).toBe('HEAD')
    expect(headLabel.target).toBe('d')
  })

  it('unreachable commits after reset --hard HEAD~1 are absent', () => {
    const repo = makeRepo()
    // a -> b -> c, but main reset to b (c unreachable)
    repo.commits['a'] = commit('a', 'msg-a', 0)
    repo.commits['b'] = commit('b', 'msg-b', 1, ['a'])
    repo.commits['c'] = commit('c', 'msg-c', 2, ['b'])
    repo.branches['main'] = 'b'

    const out = layoutGraph(repo, wt('main'))

    const ids = out.nodes.map((n) => n.id)
    expect(ids).not.toContain('c')
    expect(ids).toEqual(['a', 'b'])
    expect(out.cols).toBe(2)
  })

  it('long history: 60 commits over 4 branches, no shared (col, lane), lanes <= 5, < 50 ms', () => {
    const repo = makeRepo()
    // Build a shared 12-commit base, then 4 branches of 12 commits each = 60 total
    const base: string[] = []
    for (let i = 0; i < 12; i++) {
      const id = `base-${i}`
      repo.commits[id] = commit(id, `msg-${id}`, i, i > 0 ? [base[i - 1]] : [])
      base.push(id)
    }
    const branchNames = ['main', 'feature-a', 'feature-b', 'feature-c']
    let t = 12
    for (const bname of branchNames) {
      let prev = base[base.length - 1]
      for (let i = 0; i < 12; i++) {
        const id = `${bname}-${i}`
        repo.commits[id] = commit(id, `msg-${id}`, t++, [prev])
        prev = id
      }
      repo.branches[bname] = prev
    }

    expect(Object.keys(repo.commits)).toHaveLength(60)

    const start = performance.now()
    const out = layoutGraph(repo, wt('main'))
    const elapsed = performance.now() - start

    expect(out.nodes).toHaveLength(60)
    expect(out.lanes).toBeLessThanOrEqual(5)
    expect(out.lanes).toBe(4)

    // No two nodes share (col, lane)
    const seen = new Set<string>()
    for (const n of out.nodes) {
      const key = `${n.col},${n.lane}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }

    // Perf: well under 50 ms
    expect(elapsed).toBeLessThan(50)
  })
})
