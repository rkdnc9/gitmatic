import { describe, expect, it } from 'vitest'
import '../commands'
import { exec, text } from '../testing'
import { createWorld } from '../world'

const repo = ['git init', 'echo "a" > a.txt', 'git add a.txt', 'git commit -m "first"']

describe('git help', () => {
  it('with no argument prints every supported command, grouped', () => {
    const w = exec(repo, createWorld()).world
    const out = text(exec(['git help'], w).last)
    for (const group of ['Basics:', 'Branches:', 'Undo:']) expect(out).toContain(group)
    for (const cmd of [
      'init',
      'add',
      'commit',
      'status',
      'log',
      'diff',
      'restore',
      'show',
      'branch',
      'switch',
      'checkout',
      'merge',
      'reset',
      'revert',
      'cherry-pick',
      'stash',
      'help',
    ])
      expect(out).toContain(`git ${cmd}`)
  })

  it('git help commit prints a plain explanation starting with the summary line', () => {
    const w = exec(repo, createWorld()).world
    const out = text(exec(['git help commit'], w).last)
    expect(out.split('\n')[0]).toBe('git commit — save a snapshot of your staged files')
    expect(out).toContain('-m')
  })

  it('git commit --help prints the same explanation', () => {
    const w = exec(repo, createWorld()).world
    const direct = text(exec(['git commit --help'], w).last)
    const viaHelp = text(exec(['git help commit'], w).last)
    expect(direct).toBe(viaHelp)
  })

  it('explains every supported command with the same first-line format', () => {
    const w = exec(repo, createWorld()).world
    const cmds = [
      'init',
      'add',
      'commit',
      'status',
      'log',
      'diff',
      'restore',
      'show',
      'branch',
      'switch',
      'checkout',
      'merge',
      'reset',
      'revert',
      'cherry-pick',
      'stash',
      'help',
    ]
    for (const c of cmds) {
      const out = text(exec([`git help ${c}`], w).last)
      const first = out.split('\n')[0]
      expect(first.startsWith(`git ${c} — `), `${c}: ${first}`).toBe(true)
      expect(out.trim().split('\n').length).toBeLessThanOrEqual(6)
    }
  })

  it('unknown topics are pointed back at the command list', () => {
    const w = exec(repo, createWorld()).world
    const out = text(exec(['git help frobnicate'], w).last)
    expect(out).toContain('frobnicate')
    expect(out).toContain('git help')
  })
})
