import { describe, expect, it } from 'vitest'
import { exec, text } from '../testing'
import type { CommandResult, World } from '../types'
import '../commands'

interface ExecResult {
  text: string
  world: World
  last: CommandResult
}

/** Runs `lines` against `world` (default: fresh); returns final text, world, last result. */
function run(lines: string[], world?: World): ExecResult {
  const r = exec(lines, world)
  return { text: text(r.last), world: r.world, last: r.last }
}

/** One commit on main: a.txt=a, b.txt=b. */
const SETUP = [
  'git init',
  'echo "a" > a.txt',
  'echo "b" > b.txt',
  'git add .',
  'git commit -m "c1"',
]

/** Two commits on main; returns the world plus both shas (older first). */
function twoCommits(): { world: World; older: string; newer: string } {
  const r = run([
    ...SETUP,
    'echo "b2" > b.txt',
    'git add b.txt',
    'git commit -m "c2"',
  ])
  const main = r.world.repo!.branches.main!
  const older = r.world.repo!.commits[main].parents[0]
  return { world: r.world, older, newer: main }
}

describe('git branch', () => {
  it('lists branches with * on the current one', () => {
    const r = run([...SETUP, 'git branch feature', 'git branch'])
    expect(r.text).toContain('* main')
    expect(r.text).toContain('  feature')
  })

  it('creates a branch at HEAD without switching', () => {
    const r = run([...SETUP, 'git branch feature'])
    expect(r.last.ok).toBe(true)
    expect(Object.keys(r.world.repo!.branches)).toContain('feature')
    expect(r.world.repo!.worktrees[r.world.cwd].head).toEqual({ type: 'branch', name: 'main' })
  })

  it('creating a branch on an unborn repo is fatal', () => {
    const r = run(['git init', 'git branch x'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain("fatal: not a valid object name: 'main'")
  })

  it('creating an existing branch is fatal', () => {
    const r = run([...SETUP, 'git branch main'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain("fatal: a branch named 'main' already exists")
  })

  it('deleting a non-existent branch is fatal', () => {
    const r = run([...SETUP, 'git branch -d nothere'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain("fatal: branch 'nothere' not found")
  })

  it('deleting an unmerged branch is an error with a hint to use -D', () => {
    const r = run([
      ...SETUP,
      'git branch feature',
      'git switch feature',
      'echo "f" > f.txt',
      'git add f.txt',
      'git commit -m "feat1"',
      'git switch main',
      'git branch -d feature',
    ])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain("error: the branch 'feature' is not fully merged")
    expect(r.text).toContain("Delete the branch 'feature' with -D.")
  })

  it('deleting an unmerged branch with -D forces', () => {
    const r = run([
      ...SETUP,
      'git branch feature',
      'git switch feature',
      'echo "f" > f.txt',
      'git add f.txt',
      'git commit -m "feat1"',
      'git switch main',
      'git branch -D feature',
    ])
    expect(r.last.ok).toBe(true)
    expect(Object.keys(r.world.repo!.branches)).not.toContain('feature')
  })

  it('deleting the current branch is an error', () => {
    const r = run([...SETUP, 'git branch -d main'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain("error: cannot delete branch 'main' used by worktree at '/project'")
  })

  it('renaming a non-current branch with -m', () => {
    const r = run([...SETUP, 'git branch feature', 'git branch -m feature feat2'])
    expect(r.last.ok).toBe(true)
    expect(Object.keys(r.world.repo!.branches)).toContain('feat2')
    expect(Object.keys(r.world.repo!.branches)).not.toContain('feature')
  })

  it('renaming the current branch with -m', () => {
    const r = run([...SETUP, 'git branch -m main dev'])
    expect(r.last.ok).toBe(true)
    expect(Object.keys(r.world.repo!.branches)).toContain('dev')
    expect(r.world.repo!.worktrees[r.world.cwd].head).toEqual({ type: 'branch', name: 'dev' })
  })

  it('renaming a non-existent branch is fatal', () => {
    const r = run([...SETUP, 'git branch -m nothere nt'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain("fatal: no branch named 'nothere'")
  })

  it('detached HEAD shows a detached line, then the branch list', () => {
    const { world, older } = twoCommits()
    const after = run(['git checkout ' + older], world)
    const r = run(['git branch'], after.world)
    expect(r.text).toContain(`(HEAD detached at ${older})`)
    expect(r.text).toContain('  main')
  })
})

describe('git switch', () => {
  it('switching to an existing branch', () => {
    const r = run([...SETUP, 'git branch feature', 'git switch feature'])
    expect(r.text).toContain("Switched to branch 'feature'")
    expect(r.last.note).toBeTruthy()
    expect(r.world.repo!.worktrees[r.world.cwd].head).toEqual({ type: 'branch', name: 'feature' })
  })

  it('switching to an unknown branch is fatal', () => {
    const r = run([...SETUP, 'git switch nothere'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain('fatal: invalid reference: nothere')
  })

  it('switching to the current branch reports Already on', () => {
    const r = run([...SETUP, 'git switch main'])
    expect(r.text).toContain("Already on 'main'")
  })

  it('switch -c creates and switches to a new branch', () => {
    const r = run([...SETUP, 'git switch -c feature'])
    expect(r.text).toContain("Switched to a new branch 'feature'")
    expect(r.world.repo!.worktrees[r.world.cwd].head).toEqual({ type: 'branch', name: 'feature' })
  })

  it('switch -c then commit advances the new branch, main unchanged', () => {
    const r = run([
      ...SETUP,
      'git switch -c feature',
      'echo "f" > f.txt',
      'git add f.txt',
      'git commit -m "feat1"',
    ])
    const main = r.world.repo!.branches.main!
    const feature = r.world.repo!.branches.feature!
    expect(r.world.repo!.commits[feature].message).toBe('feat1')
    expect(r.world.repo!.commits[main].message).toBe('c1')
    expect(feature).not.toBe(main)
  })

  it('switch -c to an existing branch is fatal', () => {
    const r = run([...SETUP, 'git switch -c main'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain("fatal: a branch named 'main' already exists")
  })

  it('switch to a sha without --detach is fatal with a hint', () => {
    const { world, older } = twoCommits()
    const r = run(['git switch ' + older], world)
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain('fatal: a branch is expected, got commit')
    expect(r.text).toContain('--detach')
  })

  it('switch --detach detaches HEAD', () => {
    const { world, older } = twoCommits()
    const r = run(['git switch --detach ' + older], world)
    expect(r.last.ok).toBe(true)
    expect(r.world.repo!.worktrees[r.world.cwd].head).toEqual({ type: 'detached', commit: older })
  })

  it('committing in a detached HEAD moves only the detached HEAD', () => {
    const { world, older } = twoCommits()
    const r = run(
      [
        'git checkout ' + older,
        'echo "d" > d.txt',
        'git add d.txt',
        'git commit -m "detached1"',
      ],
      world,
    )
    const head = r.world.repo!.worktrees[r.world.cwd].head
    expect(head.type).toBe('detached')
    if (head.type === 'detached') expect(r.world.repo!.commits[head.commit].message).toBe('detached1')
    expect(r.world.repo!.commits[r.world.repo!.branches.main!].message).toBe('c2')
  })

  it('switching back from a detached HEAD warns about the stranded commit', () => {
    const { world, older } = twoCommits()
    const r = run(
      [
        'git checkout ' + older,
        'echo "d" > d.txt',
        'git add d.txt',
        'git commit -m "detached1"',
        'git switch main',
      ],
      world,
    )
    expect(r.text).toContain('Warning: you are leaving 1 commit behind')
  })
})

describe('git checkout', () => {
  it('checkout <branch> switches', () => {
    const r = run([...SETUP, 'git branch feature', 'git checkout feature'])
    expect(r.text).toContain("Switched to branch 'feature'")
  })

  it('checkout -b creates and switches', () => {
    const r = run([...SETUP, 'git checkout -b feature'])
    expect(r.text).toContain("Switched to a new branch 'feature'")
    expect(r.world.repo!.worktrees[r.world.cwd].head).toEqual({ type: 'branch', name: 'feature' })
  })

  it('checkout <sha> detaches HEAD with the detached-state message', () => {
    const { world, older } = twoCommits()
    const r = run(['git checkout ' + older], world)
    expect(r.last.ok).toBe(true)
    expect(r.text).toContain("You are in 'detached HEAD' state.")
    expect(r.world.repo!.worktrees[r.world.cwd].head).toEqual({ type: 'detached', commit: older })
  })

  it('checkout -- f restores the workdir from the index', () => {
    const r = run([...SETUP, 'echo "x" > a.txt', 'git checkout -- a.txt'])
    expect(r.last.ok).toBe(true)
    expect(r.world.files[r.world.cwd]['a.txt']).toBe('a\n')
  })

  it('checkout -- f that is not tracked is fatal', () => {
    const r = run([...SETUP, 'echo "x" > g.txt', 'git checkout -- g.txt'])
    expect(r.last.ok).toBe(false)
  })
})

describe('moveHeadTo: carry-over vs refusal', () => {
  it('carries a non-conflicting modified file across the switch', () => {
    const r = run([...SETUP, 'git branch feature', 'echo "bm" > b.txt', 'git switch feature'])
    expect(r.last.ok).toBe(true)
    expect(r.world.files[r.world.cwd]['b.txt']).toBe('bm\n')
  })

  it('carries an untracked file that the target does not have', () => {
    const r = run([...SETUP, 'git branch feature', 'echo "carry" > carry.txt', 'git switch feature'])
    expect(r.last.ok).toBe(true)
    expect(r.world.files[r.world.cwd]['carry.txt']).toBe('carry\n')
  })

  it('carries an unstaged deletion the target also lacks', () => {
    const r = run([...SETUP, 'git branch feature', 'rm b.txt', 'git switch feature'])
    expect(r.last.ok).toBe(true)
    expect(r.world.files[r.world.cwd]['b.txt']).toBeUndefined()
  })

  it('refuses when a modified file would be overwritten by the target', () => {
    const r = run([
      ...SETUP,
      'git branch feature',
      'git switch feature',
      'echo "a2" > a.txt',
      'git add a.txt',
      'git commit -m "f1"',
      'git switch main',
      'echo "amod" > a.txt',
      'git switch feature',
    ])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain(
      'error: Your local changes to the following files would be overwritten by checkout:',
    )
    expect(r.text).toContain('\ta.txt')
    expect(r.text).toContain('Please commit your changes or stash them before you switch branches.')
    expect(r.text).toContain('Aborting')
    expect(r.world.repo!.worktrees[r.world.cwd].head).toEqual({ type: 'branch', name: 'main' })
  })

  it('refuses when an untracked file would be overwritten by the target', () => {
    const r = run([
      ...SETUP,
      'git branch feature',
      'git switch feature',
      'echo "n2c" > n2.txt',
      'git add n2.txt',
      'git commit -m "n2"',
      'git switch main',
      'echo "nn" > n2.txt',
      'git switch feature',
    ])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain(
      'error: The following untracked working tree files would be overwritten by checkout:',
    )
    expect(r.text).toContain('\tn2.txt')
    expect(r.text).toContain('Please move or remove them before you switch branches.')
    expect(r.text).toContain('Aborting')
  })

  it('refuses when a modified file the target removed would be lost', () => {
    const r = run([
      'git init',
      'echo "a" > a.txt',
      'echo "b" > b.txt',
      'echo "r" > r.txt',
      'git add .',
      'git commit -m "c1"',
      'git branch feature',
      'git switch feature',
      'rm r.txt',
      'git add -A',
      'git commit -m "rm r"',
      'git switch main',
      'echo "rm" > r.txt',
      'git switch feature',
    ])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain('\tr.txt')
  })
})