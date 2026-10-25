import { describe, expect, it } from 'vitest'
import { createWorld, getStatus, headCommit } from '../engine'
import { currentWorktree } from '../engine/world'
import type { PresetId } from './presets'
import { PRESETS, buildPreset } from './presets'

describe('PRESETS', () => {
  it('has all four preset ids', () => {
    expect(Object.keys(PRESETS).sort()).toEqual([
      'blank',
      'conflict-waiting',
      'feature-branch',
      'fresh-project',
    ])
  })
  it('every preset builds without a failing line', () => {
    for (const id of Object.keys(PRESETS) as PresetId[]) {
      const preset = PRESETS[id]
      expect(() => buildPreset(id)).not.toThrow()
      const w = buildPreset(id)
      expect(w.version).toBe(1)
      // A blank preset has no repo; every other one does.
      if (preset.script.length === 0) expect(w.repo).toBeNull()
      else expect(w.repo).not.toBeNull()
    }
  })

  it('blank leaves a fresh empty world', () => {
    expect(buildPreset('blank')).toEqual(createWorld())
  })

  it('fresh-project ends on a clean main with one commit', () => {
    const w = buildPreset('fresh-project')
    const repo = w.repo!
    const wt = currentWorktree(w)!
    expect(Object.keys(repo.commits)).toHaveLength(1)
    expect(wt.head).toEqual({ type: 'branch', name: 'main' })
    expect(getStatus(w)).toEqual([])
  })

  it('feature-branch has 2 commits with main one behind', () => {
    const w = buildPreset('feature-branch')
    const repo = w.repo!
    const wt = currentWorktree(w)!
    expect(Object.keys(repo.commits)).toHaveLength(2)
    expect(wt.head).toEqual({ type: 'branch', name: 'feature' })
    expect(repo.branches['main']).not.toEqual(repo.branches['feature'])
    const mainHead = headCommit(repo, { ...wt, head: { type: 'branch', name: 'main' } })
    const featureHead = headCommit(repo, wt)
    expect(mainHead).not.toEqual(featureHead)
  })

  it('conflict-waiting is clean on main with an unmerged feature', () => {
    const w = buildPreset('conflict-waiting')
    const repo = w.repo!
    const wt = currentWorktree(w)!
    expect(wt.head).toEqual({ type: 'branch', name: 'main' })
    expect(getStatus(w)).toEqual([])
    const mainTip = headCommit(repo, wt)!
    expect(repo.commits[mainTip].tree['notes.txt']).toBe('main-edit\n')
    expect(repo.commits[repo.branches['feature']!].tree['notes.txt']).toBe('feat-edit\n')
  })
})
