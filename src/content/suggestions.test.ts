import { describe, expect, it } from 'vitest'
import { createWorld, runCommand } from '../engine'
import type { World } from '../engine'
import type { PresetId } from './presets'
import { PRESETS, buildPreset } from './presets'
import { suggestCommands } from './suggestions'

function exec(lines: string[], world: World = createWorld()): World {
  let w = world
  for (const line of lines) {
    const r = runCommand(w, line)
    if (!r.ok) throw new Error(`suggestions test setup failed: ${line}`)
    w = r.world
  }
  return w
}

describe('suggestCommands', () => {
  it('suggests git init when there is no repo', () => {
    expect(suggestCommands(createWorld())).toEqual(['git init'])
    expect(suggestCommands(exec(['echo "hi" > a.txt']))).toEqual(['git init'])
  })

  it('suggests status and add when files are untracked or modified', () => {
    const w = exec(['git init', 'echo "a" > a.txt', 'echo "b" > b.txt'])
    expect(suggestCommands(w)).toEqual(['git status', 'git add a.txt'])
  })

  it('suggests commit when the index is staged', () => {
    const w = exec(['git init', 'echo "a" > a.txt', 'git add a.txt'])
    expect(suggestCommands(w)).toEqual(['git commit -m "describe your change"'])
  })

  it('suggests nothing on a clean unborn branch', () => {
    expect(suggestCommands(exec(['git init']))).toEqual([])
  })

  it('suggests log and a branch when the tree is clean with commits', () => {
    expect(suggestCommands(buildPreset('fresh-project'))).toEqual([
      'git log --oneline',
      'git switch -c feature',
    ])
  })

  it('suggests edit, add, and abort during a merge conflict', () => {
    const r = runCommand(buildPreset('conflict-waiting'), 'git merge feature')
    expect(r.ok).toBe(true)
    expect(suggestCommands(r.world)).toEqual([
      'edit notes.txt',
      'git add notes.txt',
      'git merge --abort',
    ])
  })

  it('conflicts outrank staged changes', () => {
    // Staging the conflicted file resolves it, so stage an unrelated file to
    // prove the conflict chips still win while a staged change is pending.
    let w = runCommand(buildPreset('conflict-waiting'), 'git merge feature').world
    w = runCommand(w, 'echo "x" > other.txt').world
    w = runCommand(w, 'git add other.txt').world
    expect(w.repo!.worktrees[w.cwd].pending!.conflicts).toEqual(['notes.txt'])
    expect(suggestCommands(w)).toEqual(['edit notes.txt', 'git add notes.txt', 'git merge --abort'])
  })

  it('never suggests more than four commands', () => {
    const worlds: World[] = [
      createWorld(),
      exec(['git init', 'echo "a" > a.txt']),
      exec(['git init', 'echo "a" > a.txt', 'git add a.txt']),
      buildPreset('fresh-project'),
    ]
    for (const id of Object.keys(PRESETS) as PresetId[]) worlds.push(buildPreset(id))
    for (const w of worlds) expect(suggestCommands(w).length).toBeLessThanOrEqual(4)
  })
})
