import { describe, expect, it } from 'vitest'
import { exec } from '../testing'
import '../commands'
import { getCompletions } from '../completions'
import type { World } from '../types'
import { createWorld } from '../world'

function worldWith(script: string[]): World {
  return exec(script, createWorld()).world
}

describe('getCompletions', () => {
  const gitRepo = worldWith([
    'git init',
    'echo "n" > notes.txt',
    'git add notes.txt',
    'git commit -m "seed"',
  ])

  it('completes git subcommands from a prefix', () => {
    expect(getCompletions(gitRepo, 'git sw')).toEqual(['switch'])
  })

  it('completes subcommand flags', () => {
    expect(getCompletions(gitRepo, 'git swi --')).toEqual(['--create', '--detach'])
  })

  it('completes branch names where a branch/rev is expected', () => {
    const w = worldWith([
      'git init',
      'echo "n" > notes.txt',
      'git add notes.txt',
      'git commit -m "seed"',
      'git branch feature',
    ])
    expect(getCompletions(w, 'git switch fe')).toEqual(['feature'])
    expect(getCompletions(w, 'git merge f')).toEqual(['feature'])
  })

  it('completes file names for file-operand commands', () => {
    const w = worldWith([
      'git init',
      'echo "n" > notes.txt',
      'echo "x" > extra.txt',
      'git add .',
      'git commit -m "seed"',
    ])
    expect(getCompletions(w, 'cat no')).toEqual(['notes.txt'])
    expect(getCompletions(w, 'git add no')).toEqual(['notes.txt'])
    expect(getCompletions(w, 'rm no')).toEqual(['notes.txt'])
    expect(getCompletions(w, 'edit no')).toEqual(['notes.txt'])
    expect(getCompletions(w, 'cat')).toEqual(['extra.txt', 'notes.txt'])
  })

  it('completes top-level commands', () => {
    expect(getCompletions(createWorld(), 'gi')).toEqual(['git'])
    expect(getCompletions(createWorld(), 'ca')).toEqual(['cat'])
    expect(getCompletions(createWorld(), '')).toEqual([
      'cat',
      'clear',
      'echo',
      'edit',
      'git',
      'ls',
      'pwd',
      'rm',
      'touch',
    ])
  })

  it('returns the full candidate word for the last token, sorted', () => {
    const w = worldWith([
      'git init',
      'echo "n" > notes.txt',
      'echo "a" > aaa.txt',
      'git add .',
      'git commit -m "seed"',
    ])
    expect(getCompletions(w, 'git lo')).toEqual(['log'])
    expect(getCompletions(w, 'git branch -')).toEqual([
      '--delete',
      '--force',
      '--move',
      '-D',
      '-d',
      '-m',
    ])
    expect(getCompletions(w, 'cat a')).toEqual(['aaa.txt'])
    // no candidate → empty
    expect(getCompletions(w, 'cat zzz')).toEqual([])
  })

  it('completes stash subcommands and refs', () => {
    const w = worldWith([
      'git init',
      'echo "n" > notes.txt',
      'git add notes.txt',
      'git commit -m "seed"',
      'echo "m" > notes.txt',
      'git stash',
    ])
    expect(getCompletions(w, 'git stash ')).toEqual(['apply', 'drop', 'list', 'pop', 'push'])
    expect(getCompletions(w, 'git stash pop st')).toEqual(['stash@{0}'])
  })
})
