import { describe, expect, it } from 'vitest'
import { exec, text } from '../testing'
import '../commands'
import { createWorld } from '../world'

const BASE = [
  'git init',
  'echo "a" > a.txt',
  'echo "n" > notes.txt',
  'git add a.txt notes.txt',
  'git commit -m "seed"',
]

/** main lags feature by one commit, so merging feature fast-forwards. */
const FAST = [
  ...BASE,
  'git switch -c feature',
  'echo "f" > f.txt',
  'git add f.txt',
  'git commit -m "f"',
  'git switch main',
]

/** Diverged, non-conflicting: feature adds f.txt, main adds m.txt. */
const CLEAN = [...FAST, 'echo "m" > m.txt', 'git add m.txt', 'git commit -m "m"']

/** Diverged, conflicting: both branches edited notes.txt. */
const CONFLICT = [
  ...FAST,
  'git switch feature',
  'echo "x1" > notes.txt',
  'git add notes.txt',
  'git commit -m "x"',
  'git switch main',
  'echo "y1" > notes.txt',
  'git add notes.txt',
  'git commit -m "y"',
]

const SIDE = [
  ...BASE,
  'git switch -c side',
  'echo "s" > s.txt',
  'git add s.txt',
  'git commit -m "s"',
]
const DIRTY_STAGED = [...BASE, 'echo "b" > a.txt', 'git add a.txt']

/**
 * Every successful state-changing command leaves a short note (≤ 120 chars)
 * for the UI's "what just happened" line.
 */
const CASES: [string[], string][] = [
  [[], 'git init'],
  [DIRTY_STAGED, 'git add a.txt'],
  [DIRTY_STAGED, 'git commit -m "second"'],
  [BASE, 'git branch feature'],
  [[...BASE, 'git branch feature'], 'git switch feature'],
  [BASE, 'git checkout -b topic'],
  [FAST, 'git merge feature'],
  [CLEAN, 'git merge feature'],
  [CLEAN, 'git merge --squash feature'],
  [CONFLICT, 'git merge feature'],
  [[...CONFLICT, 'git merge feature'], 'git merge --abort'],
  [
    [...CONFLICT, 'git merge feature', 'echo "fixed" > notes.txt', 'git add notes.txt'],
    'git commit -m "merged"',
  ],
  [SIDE, 'git reset --hard HEAD~1'],
  [SIDE, 'git reset --soft HEAD~1'],
  [DIRTY_STAGED, 'git reset'],
  [DIRTY_STAGED, 'git reset a.txt'],
  [[...BASE, 'echo "b" > a.txt', 'git add a.txt', 'git commit -m "second"'], 'git revert HEAD'],
  [
    [
      ...BASE,
      'git switch -c side',
      'echo "s" > s.txt',
      'git add s.txt',
      'git commit -m "s"',
      'git switch main',
    ],
    'git cherry-pick side',
  ],
  [[...BASE, 'echo "b" > a.txt'], 'git stash'],
  [[...BASE, 'echo "b" > a.txt', 'git stash'], 'git stash pop'],
  [[...BASE, 'echo "b" > a.txt', 'git stash'], 'git stash apply'],
  [[...BASE, 'echo "b" > a.txt', 'git stash'], 'git stash drop'],
  [DIRTY_STAGED, 'git restore a.txt'],
  [DIRTY_STAGED, 'git restore --staged a.txt'],
  [DIRTY_STAGED, 'git checkout -- a.txt'],
  [BASE, 'git switch -c feature'],
  [BASE, 'git commit --amend -m "seed v2"'],
]

describe('command notes audit', () => {
  it.each(CASES.map(([setup, command]) => [command, setup]))(
    '%s leaves a note ≤ 120 chars',
    (command, setup) => {
      const { all } = exec([...setup, command], createWorld())
      const last = all.at(-1)!
      expect(last.ok, `command failed: ${text(last)}`).toBe(true)
      expect(last.note, `no note for: ${command}`).not.toBeNull()
      expect(last.note!.length, `note too long for: ${command}: ${last.note}`).toBeLessThanOrEqual(
        120,
      )
    },
  )

  it('read-only commands leave no note', () => {
    const reads = [
      'git status',
      'git log',
      'git log --oneline',
      'git diff',
      'git show HEAD',
      'ls',
      'cat a.txt',
    ]
    const { all } = exec([...BASE, ...reads], createWorld())
    for (const [i, r] of all.slice(BASE.length).entries()) {
      expect(r.ok, `failed: ${reads[i]}: ${text(r)}`).toBe(true)
      expect(r.note, `unexpected note for: ${reads[i]}: ${r.note}`).toBeNull()
    }
  })
})
