import { describe, expect, it } from 'vitest'
import { exec, text } from '../testing'
import type { CommandResult, World } from '../types'
import { merge3, mergeTrees } from '../merge3'
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

/** The three-way text merge, with git's conflict marker labels. */
const labels = { ours: 'HEAD', theirs: 'feat' } as const

/** Sets up a diverged history where both branches edited notes.txt, then merges. */
const CONFLICT_SETUP = [
  'git init',
  'echo "line1" > notes.txt',
  'git add .',
  'git commit -m "c1"',
  'git branch feature',
  'echo "main-edit" > notes.txt',
  'git commit -am "c2"',
  'git switch feature',
  'echo "feat-edit" > notes.txt',
  'git commit -am "c3"',
  'git switch main',
  'git merge feature',
]

describe('merge3 (unit)', () => {
  it('returns a clean merge when both sides make the same change', () => {
    const r = merge3('a\nb\n', 'A\nb\n', 'A\nb\n', labels)
    expect(r.conflict).toBe(false)
    expect(r.text).toBe('A\nb\n')
  })

  it('takes the changed side when only one side changed', () => {
    expect(merge3('a\nb\n', 'A\nb\n', 'a\nb\n', labels).text).toBe('A\nb\n')
    expect(merge3('a\nb\n', 'a\nb\n', 'a\nB\n', labels).text).toBe('a\nB\n')
  })

  it('merges disjoint changes on either side', () => {
    const r = merge3('a\nb\nc\n', 'A\nb\nc\n', 'a\nb\nC\n', labels)
    expect(r.conflict).toBe(false)
    expect(r.text).toBe('A\nb\nC\n')
  })

  it('conflicts when both sides change the same line, with git markers', () => {
    const r = merge3('a\nb\nc\n', 'A\nb\nc\n', 'a\nB\nc\n', labels)
    expect(r.conflict).toBe(true)
    expect(r.text).toBe('<<<<<<< HEAD\nA\nb\n=======\na\nB\n>>>>>>> feat\nc\n')
  })

  it('conflicts on add/add with different content', () => {
    const r = merge3('', 'x\n', 'y\n', labels)
    expect(r.conflict).toBe(true)
    expect(r.text).toContain('<<<<<<< HEAD')
    expect(r.text).toContain('=======')
    expect(r.text).toContain('>>>>>>> feat')
  })

  it('conflicts on modify/delete at the text level (content-keeping is a mergeTrees rule)', () => {
    const r = merge3('a\n', 'A\n', '', labels)
    expect(r.conflict).toBe(true)
    expect(r.text).toBe('<<<<<<< HEAD\nA\n=======\n>>>>>>> feat\n')
  })
})

describe('mergeTrees (unit)', () => {
  it('keeps the modified content on a modify/delete', () => {
    const r = mergeTrees({ f: 'a\n' }, { f: 'A\n' }, {}, labels)
    expect(r.conflicts).toEqual(['f'])
    expect(r.kinds.f).toBe('modify/delete')
    expect(r.workdir.f).toBe('A\n') // the modified side survives; the index keeps base
    expect(r.tree.f).toBe('a\n')
  })
})

describe('git merge: fast-forward', () => {
  it('already up to date when the target is not ahead', () => {
    const r = run([
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "c1"',
      'git branch feature',
      'git merge feature',
    ])
    expect(r.last.ok).toBe(true)
    expect(r.text).toBe('Already up to date.')
  })

  it('fast-forwards: moves the branch only, no new commit', () => {
    const r = run([
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "c1"',
      'git branch feature',
      'git switch feature',
      'echo "f" > f.txt',
      'git add .',
      'git commit -m "c2"',
      'git switch main',
      'git merge feature',
    ])
    expect(r.last.ok).toBe(true)
    const repo = r.world.repo!
    const main = repo.branches.main
    const before = repo.commits[main].message
    expect(before).toBe('c2')
    // The fast-forward created no new commit: main now points at the feature tip.
    const feature = repo.branches.feature
    expect(main).toBe(feature)
    // Commit count unchanged by the merge (c1, c2 only).
    expect(Object.keys(repo.commits)).toHaveLength(2)
    // The workdir carries the merged file.
    expect(r.world.files[r.world.cwd]['f.txt']).toBe('f\n')
    // Exact fast-forward header.
    expect(r.text).toContain('Updating ')
    expect(r.text).toContain('Fast-forward')
    expect(r.text.split('\n')[0]).toMatch(/^Updating [0-9a-f]{7}\.\.[0-9a-f]{7}$/)
  })
})

describe('git merge: merge commit', () => {
  it('creates a two-parent merge commit with the merged tree when branches diverged', () => {
    const r = run([
      'git init',
      'echo "base" > notes.txt',
      'git add .',
      'git commit -m "c1"',
      'git branch feature',
      'echo "mainline" > main.txt',
      'git add .',
      'git commit -m "c2"',
      'git switch feature',
      'echo "feature" > feat.txt',
      'git add .',
      'git commit -m "c3"',
      'git switch main',
      'git merge feature',
    ])
    expect(r.last.ok).toBe(true)
    const repo = r.world.repo!
    const merge = repo.commits[repo.branches.main]
    expect(merge.parents).toHaveLength(2)
    expect(merge.message).toBe("Merge branch 'feature'")
    expect(Object.keys(repo.commits)).toHaveLength(4)
    // Merged tree carries both sides' files plus the base file.
    expect(merge.tree).toEqual({ 'notes.txt': 'base\n', 'main.txt': 'mainline\n', 'feat.txt': 'feature\n' })
    // The merge-commit line (git prints the strategy, not a bracket line, on a clean merge).
    expect(r.text).toBe("Merge made by the 'ort' strategy.")
    // Workdir reflects the merged tree.
    expect(r.world.files[r.world.cwd]['feat.txt']).toBe('feature\n')
    expect(r.world.files[r.world.cwd]['main.txt']).toBe('mainline\n')
  })
})

describe('git merge: conflicts', () => {

  it('prints the conflict messages and leaves the merge pending', () => {
    const r = run(CONFLICT_SETUP)
    expect(r.last.ok).toBe(true) // conflicted merge mutates the world (pending + markers); it cannot throw
    expect(r.text).toBe(
      [
        'Auto-merging notes.txt',
        'CONFLICT (content): Merge conflict in notes.txt',
        'Automatic merge failed; fix conflicts and then commit the result.',
      ].join('\n'),
    )
    const wt = r.world.repo!.worktrees[r.world.cwd]
    expect(wt.pending).not.toBeNull()
    expect(wt.pending!.conflicts).toEqual(['notes.txt'])
  })

  it('writes all three marker sections into the workdir file', () => {
    const r = run(CONFLICT_SETUP)
    const content = r.world.files[r.world.cwd]['notes.txt']
    expect(content).toBe(
      [
        '<<<<<<< HEAD',
        'main-edit',
        '=======',
        'feat-edit',
        '>>>>>>> feature',
      ].join('\n') + '\n',
    )
  })

  it('leaves the index unchanged for the conflicted path', () => {
    const r = run(CONFLICT_SETUP)
    const wt = r.world.repo!.worktrees[r.world.cwd]
    // The index still holds the base content (HEAD's version), not either side's.
    expect(wt.index['notes.txt']).toBe('line1\n')
  })

  it('shows the unmerged section in status', () => {
    const r = run([...CONFLICT_SETUP, 'git status'])
    expect(r.text).toBe(
      [
        'On branch main',
        'You have unmerged paths.',
        '  (fix conflicts and run "git commit")',
        '  (use "git merge --abort" to abort the merge)',
        '',
        'Unmerged paths:',
        '  (use "git add <file>..." to mark resolution)',
        '\tboth modified:   notes.txt',
        '',
        'no changes added to commit (use "git add" and/or "git commit -a")',
      ].join('\n'),
    )
  })

  it('keeps clean files merged while a conflict remains in another file', () => {
    const r = run([
      'git init',
      'echo "base" > notes.txt',
      'echo "keep" > other.txt',
      'git add .',
      'git commit -m "c1"',
      'git branch feature',
      'echo "main-edit" > notes.txt',
      'git commit -am "c2"',
      'git switch feature',
      'echo "feat-edit" > notes.txt',
      'echo "feat-other" > other.txt',
      'git commit -am "c3"',
      'git switch main',
      'git merge feature',
    ])
    expect(r.last.ok).toBe(true) // conflicted merge mutates the world (pending + markers); it cannot throw
    const work = r.world.files[r.world.cwd]
    // other.txt merged cleanly (took the feature version); notes.txt has markers.
    expect(work['other.txt']).toBe('feat-other\n')
    expect(work['notes.txt']).toContain('<<<<<<< HEAD')
    // The clean file is staged; the conflicted file is not.
    const wt = r.world.repo!.worktrees[r.world.cwd]
    expect(wt.index['other.txt']).toBe('feat-other\n')
    expect(wt.index['notes.txt']).toBe('base\n')
  })

  it('resolves via write + add + commit into a two-parent merge commit', () => {
    const r = run([
      ...CONFLICT_SETUP,
      'echo "resolved" > notes.txt',
      'git add notes.txt',
      'git commit -m "merge it"',
    ])
    expect(r.last.ok).toBe(true)
    const repo = r.world.repo!
    const wt = repo.worktrees[r.world.cwd]
    expect(wt.pending).toBeNull()
    const merge = repo.commits[repo.branches.main]
    expect(merge.parents).toHaveLength(2)
    expect(merge.message).toBe('merge it')
    expect(merge.tree['notes.txt']).toBe('resolved\n')
    expect(r.world.files[r.world.cwd]['notes.txt']).toBe('resolved\n')
  })

  it('resolving removes the path from the pending conflicts', () => {
    const r = run([...CONFLICT_SETUP, 'echo "resolved" > notes.txt', 'git add notes.txt'])
    const wt = r.world.repo!.worktrees[r.world.cwd]
    expect(wt.pending).not.toBeNull()
    expect(wt.pending!.conflicts).toEqual([])
    // With all conflicts resolved, status reports the merge is still in progress.
    const s = run(['git status'], r.world)
    expect(s.text).toContain('All conflicts fixed but you are still merging.')
  })
})

describe('git merge: abort', () => {
  it('restores the original tree, HEAD and clears pending', () => {
    const before = run(CONFLICT_SETUP.slice(0, -1))
    const origHead = before.world.repo!.branches.main
    const origTree = { ...before.world.repo!.commits[origHead].tree }
    const r = run([...CONFLICT_SETUP, 'git merge --abort'])
    expect(r.last.ok).toBe(true)
    const repo = r.world.repo!
    const wt = repo.worktrees[r.world.cwd]
    expect(wt.pending).toBeNull()
    expect(repo.branches.main).toBe(origHead)
    // Workdir restored to the original tree exactly.
    expect(r.world.files[r.world.cwd]).toEqual(origTree)
    expect(wt.index).toEqual(origTree)
  })

  it('is fatal when there is no merge to abort', () => {
    const r = run(['git init', 'echo "a" > a.txt', 'git add .', 'git commit -m "c1"', 'git merge --abort'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toBe('fatal: There is no merge to abort (MERGE_HEAD missing).')
  })
})

describe('git merge: commit while pending', () => {
  it('refuses to commit while unmerged files remain', () => {
    const r = run([...CONFLICT_SETUP, 'git commit -m "x"'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toBe('error: Committing is not possible because you have unmerged files.')
  })

  it('uses the pending default message when committed without -m', () => {
    const r = run([
      ...CONFLICT_SETUP,
      'echo "resolved" > notes.txt',
      'git add notes.txt',
      'git commit',
    ])
    expect(r.last.ok).toBe(true)
    const merge = r.world.repo!.commits[r.world.repo!.branches.main]
    expect(merge.parents).toHaveLength(2)
    expect(merge.message).toBe("Merge branch 'feature'")
    expect(r.world.repo!.worktrees[r.world.cwd].pending).toBeNull()
  })
})

describe('git merge: refusal guards', () => {
  it('refuses to merge again while a merge is pending with conflicts', () => {
    const r = run([...CONFLICT_SETUP, 'git merge feature'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toBe('error: Merging is not possible because you have unmerged files.')
  })

  it('refuses to switch branches while a merge is pending', () => {
    const r = run([...CONFLICT_SETUP, 'git switch feature'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toBe('error: you need to resolve your current index first')
  })

  it('refuses to checkout a branch while a merge is pending', () => {
    const r = run([...CONFLICT_SETUP, 'git checkout feature'])
    expect(r.last.ok).toBe(false)
    expect(r.text).toBe('error: you need to resolve your current index first')
  })
})

describe('git merge: dirty workdir refusals', () => {
  const ffDirty = () =>
    run([
      'git init',
      'echo "base" > notes.txt',
      'git add .',
      'git commit -m "c1"',
      'git branch feature',
      'git switch feature',
      'echo "feat" > notes.txt',
      'git commit -am "c2"',
      'git switch main',
      'echo "dirty" > notes.txt',
      'git merge feature',
    ])

  it('refuses a fast-forward when a touched file is dirty in the workdir', () => {
    const r = ffDirty()
    const repo = r.world.repo!
    const main = repo.branches.main
    const feature = repo.branches.feature
    expect(r.last.ok).toBe(false)
    expect(r.text).toBe(
      [
        'error: Your local changes to the following files would be overwritten by merge:',
        '\tnotes.txt',
        'Please commit your changes or stash them before you merge.',
        'Aborting',
        `Updating ${main}..${feature}`,
      ].join('\n'),
    )
    // The merge was refused: main did not move and the workdir is untouched.
    expect(main).not.toBe(feature)
    expect(r.world.files[r.world.cwd]['notes.txt']).toBe('dirty\n')
  })

  it('refuses a non-ff merge when a touched file is dirty in the workdir', () => {
    const r = run([
      'git init',
      'echo "base" > notes.txt',
      'git add .',
      'git commit -m "c1"',
      'git branch feature',
      'echo "mainline" > main.txt',
      'git add .',
      'git commit -m "c2"',
      'git switch feature',
      'echo "feat" > notes.txt',
      'git commit -am "c3"',
      'git switch main',
      'echo "dirty" > notes.txt',
      'git merge feature',
    ])
    expect(r.last.ok).toBe(false)
    expect(r.text).toBe(
      [
        'error: Your local changes to the following files would be overwritten by merge:',
        '\tnotes.txt',
        'Please commit your changes or stash them before you merge.',
        'Aborting',
        'Merge with strategy ort failed.',
      ].join('\n'),
    )
  })

  it('refuses a non-ff merge when a touched file is dirty in the index', () => {
    const r = run([
      'git init',
      'echo "base" > notes.txt',
      'git add .',
      'git commit -m "c1"',
      'git branch feature',
      'echo "mainline" > notes.txt',
      'git commit -am "c2"',
      'git switch feature',
      'echo "feat" > feat.txt',
      'git add .',
      'git commit -m "c3"',
      'git switch main',
      'echo "dirty" > notes.txt',
      'git add notes.txt',
      'git merge feature',
    ])
    expect(r.last.ok).toBe(false)
    expect(r.text).toBe(
      [
        'error: Your local changes to the following files would be overwritten by merge:',
        '  notes.txt',
        'Merge with strategy ort failed.',
      ].join('\n'),
    )
  })

  it('refuses when an untracked file would be created by the merge', () => {
    const r = run([
      'git init',
      'echo "base" > notes.txt',
      'git add .',
      'git commit -m "c1"',
      'git branch feature',
      'git switch feature',
      'echo "newfile" > brandnew.txt',
      'git add .',
      'git commit -m "c2"',
      'git switch main',
      'echo "untracked" > brandnew.txt',
      'git merge feature',
    ])
    expect(r.last.ok).toBe(false)
    expect(r.text).toContain(
      [
        'error: The following untracked working tree files would be overwritten by merge:',
        '\tbrandnew.txt',
        'Please move or remove them before you merge.',
        'Aborting',
      ].join('\n'),
    )
  })
})

describe('git merge --squash', () => {
  it('stages the merged result without committing or moving HEAD', () => {
    const r = run([
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "c1"',
      'git branch feature',
      'git switch feature',
      'echo "f" > f.txt',
      'git add .',
      'git commit -m "c2"',
      'git switch main',
      'git merge --squash feature',
    ])
    expect(r.last.ok).toBe(true)
    expect(r.text).toBe('Squash commit -- not updating HEAD')
    const repo = r.world.repo!
    const wt = repo.worktrees[r.world.cwd]
    // HEAD did not move; the result is staged in the index and workdir.
    expect(repo.commits[repo.branches.main].message).toBe('c1')
    expect(wt.index['f.txt']).toBe('f\n')
    expect(r.world.files[r.world.cwd]['f.txt']).toBe('f\n')
    // No merge is pending.
    expect(wt.pending).toBeNull()
    // HEAD commit count is unchanged (no new commit created).
    expect(Object.keys(repo.commits)).toHaveLength(2)
  })
})
