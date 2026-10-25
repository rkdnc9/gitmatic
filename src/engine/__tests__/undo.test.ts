import { describe, expect, it } from 'vitest'
import { exec, text } from '../testing'
import '../commands'

/** Two commits: a1 then a2 (main). Returns setup lines. */
function two(): string[] {
  return [
    'git init',
    'echo "a1" > a.txt',
    'git add a.txt',
    'git commit -m "c1"',
    'echo "a2" > a.txt',
    'git commit -am "c2"',
  ]
}

describe('git reset', () => {
  it('--soft keeps index and workdir; only HEAD moves', () => {
    const r = exec([...two(), 'git reset --soft HEAD~1'])
    expect(r.last.ok).toBe(true)
    // HEAD moved back to c1 (a1) but index still holds a2 (the c2 tree).
    const d = exec([...two(), 'git reset --soft HEAD~1', 'git diff --staged'])
    expect(text(d.last)).toContain('+a2')
    // workdir still a2
    expect(text(exec([...two(), 'git reset --soft HEAD~1', 'cat a.txt']).last)).toContain('a2')
  })

  it('--mixed resets index to HEAD, keeps workdir', () => {
    // dirty workdir (a2) + reset back one (to c1/a1): index:=a1, workdir keeps a2.
    const r = exec([
      ...two(),
      'echo "a2" > a.txt',
      'git reset --mixed HEAD~1',
      'git diff --staged',
    ])
    // index now = c1 tree (a1), HEAD = c1 -> staged diff empty
    expect(text(r.last)).toBe('')
    expect(text(exec([...two(), 'echo "a2" > a.txt', 'git reset --mixed HEAD~1', 'cat a.txt']).last)).toContain('a2')
  })

  it('--mixed with unstaged changes prints the unstaged list', () => {
    const r = exec([...two(), 'echo "a3" > a.txt', 'git reset'])
    const t = text(r.last)
    expect(t).toContain('Unstaged changes after reset:')
    expect(t).toContain('M\ta.txt')
  })

  it('--hard resets index and workdir to HEAD', () => {
    const r = exec([...two(), 'echo "a3" > a.txt', 'git reset --hard HEAD~1'])
    const t = text(r.last)
    expect(t).toContain('HEAD is now at')
    // workdir restored to a1
    expect(text(exec([...two(), 'echo "a3" > a.txt', 'git reset --hard HEAD~1', 'cat a.txt']).last)).toContain('a1')
    expect(text(exec([...two(), 'echo "a3" > a.txt', 'git reset --hard HEAD~1', 'git diff --staged']).last)).toBe('')
  })

  it('<path> unstages a file (index := HEAD)', () => {
    const r = exec([...two(), 'echo "a9" > a.txt', 'git add a.txt', 'git reset a.txt'])
    expect(r.last.ok).toBe(true)
    // index back to a2 (HEAD); workdir keeps a9 (unstaged)
    expect(text(exec([...two(), 'echo "a9" > a.txt', 'git add a.txt', 'git reset a.txt', 'git diff --staged']).last)).toBe('')
    expect(text(exec([...two(), 'echo "a9" > a.txt', 'git add a.txt', 'git reset a.txt', 'cat a.txt']).last)).toContain('a9')
  })

  it('-- <path> also unstages', () => {
    const r = exec([...two(), 'echo "a9" > a.txt', 'git add a.txt', 'git reset -- a.txt', 'git diff --staged'])
    expect(text(r.last)).toBe('')
  })

  it('unknown rev -> ambiguous argument', () => {
    const r = exec([...two(), 'git reset zz'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toContain("fatal: ambiguous argument 'zz': unknown revision or path not in the working tree.")
  })

  it('unknown path after -- is a no-op (pathspec matching nothing)', () => {
    const r = exec([...two(), 'git reset -- zz'])
    expect(r.last.ok).toBe(true)
    // A pathspec that matches nothing is a silent no-op (like real git reset).
    expect(text(r.last)).toBe('')
  })
})

describe('git revert', () => {
  it('of the HEAD commit applies the inverse', () => {
    // revert c2 (a1->a2) => a back to a1.
    const r = exec([...two(), 'git revert HEAD'])
    expect(r.last.ok).toBe(true)
    expect(text(r.last)).toContain('Revert "c2"')
    expect(text(exec([...two(), 'git revert HEAD', 'cat a.txt']).last)).toContain('a1')
  })

  it('of a middle commit restores the pre-commit content', () => {
    // c1 adds a.txt (a1) and b.txt (b1); c2 changes a to a2; c3 changes b to b3.
    // Revert c2 => a.txt back to a1, b.txt still b3.
    const setup = [
      'git init',
      'echo "a1" > a.txt',
      'echo "b1" > b.txt',
      'git add a.txt b.txt',
      'git commit -m "c1"',
      'echo "a2" > a.txt',
      'git commit -am "c2"',
      'echo "b3" > b.txt',
      'git commit -am "c3"',
    ]
    const r = exec([...setup, 'git revert HEAD~1'])
    expect(r.last.ok).toBe(true)
    expect(text(r.last)).toContain('Revert "c2"')
    expect(text(exec([...setup, 'git revert HEAD~1', 'cat a.txt']).last)).toContain('a1')
    expect(text(exec([...setup, 'git revert HEAD~1', 'cat b.txt']).last)).toContain('b3')
  })

  it('conflict -> pending; resolve + --continue commits; --abort restores', () => {
    // c1 a=a1; c2 a=a2; c3 a=a3. Reverting c2 (change a1->a2) while HEAD is a3:
    // base (c2 tree) = a2, ours = a3, theirs (c1 tree) = a1 -> both sides differ
    // from base and from each other -> CONFLICT (content).
    const setup = [
      'git init',
      'echo "a1" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "a2" > a.txt',
      'git commit -am "c2"',
      'echo "a3" > a.txt',
      'git commit -am "c3"',
    ]
    const r = exec([...setup, 'git revert HEAD~1'])
    expect(r.last.ok).toBe(true)
    const t = text(r.last)
    expect(t).toContain('CONFLICT (content): Merge conflict in a.txt')
    expect(t).toContain('error: revert: a.txt: needs merge')
    expect(t).toContain('git revert --continue')
    // workdir now has conflict markers
    expect(text(exec([...setup, 'git revert HEAD~1', 'cat a.txt']).last)).toContain('<<<<<<< HEAD')

    // resolve + continue commits
    const r2 = exec([...setup, 'git revert HEAD~1', 'echo "a1" > a.txt', 'git add a.txt', 'git revert --continue'])
    expect(r2.last.ok).toBe(true)
    expect(text(r2.last)).toContain('Revert "c2"')

    // --abort restores
    const r3 = exec([...setup, 'git revert HEAD~1', 'git revert --abort'])
    expect(r3.last.ok).toBe(true)
    expect(text(exec([...setup, 'git revert HEAD~1', 'git revert --abort', 'cat a.txt']).last)).toContain('a3')
  })

  it('--abort with nothing in progress -> error', () => {
    const r = exec([...two(), 'git revert --abort'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toContain('error: no cherry-pick or revert in progress')
  })

  it('with staged changes -> refused', () => {
    const r = exec([...two(), 'echo "a9" > a.txt', 'git add a.txt', 'git revert HEAD'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toContain('your local changes would be overwritten by revert')
  })
})

describe('git cherry-pick', () => {
  it('copies the change with a new id and the same message', () => {
    const r = exec([
      ...two(),
      'git branch feat HEAD~1',
      'git switch feat',
      'git cherry-pick main',
    ])
    expect(r.last.ok).toBe(true)
    expect(text(r.last)).toContain('c2')
    // a.txt is now a2 on feat (a different commit than main's c2)
    expect(text(exec([...two(), 'git branch feat HEAD~1', 'git switch feat', 'git cherry-pick main', 'cat a.txt']).last)).toContain('a2')
  })

  it('conflict -> pending; resolve + --continue', () => {
    const setup = [
      'git init',
      'echo "a1" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "a2" > a.txt',
      'git commit -am "c2"',
    ]
    const r = exec([...setup, 'git branch feat HEAD~1', 'git switch feat', 'echo "a9" > a.txt', 'git commit -am "c9"', 'git cherry-pick main'])
    expect(r.last.ok).toBe(true)
    expect(text(r.last)).toContain('CONFLICT (content): Merge conflict in a.txt')
    expect(text(r.last)).toContain('git cherry-pick --continue')
    const r2 = exec([...setup, 'git branch feat HEAD~1', 'git switch feat', 'echo "a9" > a.txt', 'git commit -am "c9"', 'git cherry-pick main', 'echo "a2" > a.txt', 'git add a.txt', 'git cherry-pick --continue'])
    expect(r2.last.ok).toBe(true)
    expect(text(r2.last)).toContain('c2')
  })

  it('unknown rev -> bad revision', () => {
    const r = exec([...two(), 'git cherry-pick zz'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toContain("fatal: bad revision 'zz'")
  })

  it('--continue with no cherry-pick in progress -> error', () => {
    const r = exec([...two(), 'git cherry-pick --continue'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toContain('error: no cherry-pick or revert in progress')
  })
})

describe('git stash', () => {
  it('push / list / pop round-trips staged and unstaged; pop drops', () => {
    const setup = [
      'git init',
      'echo "a1" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "a2" > a.txt',
      'git add a.txt',
      'echo "a3" > a.txt',
      'git stash push -m "wip"',
    ]
    expect(text(exec(setup).last)).toContain('Saved working directory and index state On main: wip')
    // workdir back to a1
    expect(text(exec([...setup, 'cat a.txt']).last)).toContain('a1')
    expect(text(exec([...setup, 'git stash list']).last)).toContain('stash@{0}: On main: wip')
    // pop restores
    const r = exec([...setup, 'git stash pop'])
    expect(text(r.last)).toContain('Dropped refs/stash@{0}')
    // A default pop restores the change as UNSTAGED (index stays at HEAD): nothing staged,
    // and the working tree holds the newest content.
    expect(text(exec([...setup, 'git stash pop', 'git diff --staged']).last)).toBe('')
    expect(text(exec([...setup, 'git stash pop', 'git diff']).last)).toContain('+a3')
    expect(text(exec([...setup, 'git stash pop', 'cat a.txt']).last)).toContain('a3')
    // empty after pop
    expect(text(exec([...setup, 'git stash pop', 'git stash list']).last)).toBe('')
  })

  it('push with no changes -> No local changes to save', () => {
    const r = exec([...two(), 'git stash'])
    expect(r.last.ok).toBe(true)
    expect(text(r.last)).toContain('No local changes to save')
  })

  it('does not stash untracked files', () => {
    const r = exec(['git init', 'echo "a1" > a.txt', 'git add a.txt', 'git commit -m c1', 'echo "u" > u.txt', 'git stash'])
    expect(text(r.last)).toContain('No local changes to save')
    // untracked remains
    expect(text(exec(['git init', 'echo "a1" > a.txt', 'git add a.txt', 'git commit -m c1', 'echo "u" > u.txt', 'git stash', 'cat u.txt']).last)).toContain('u')
  })

  it('apply restores but keeps the entry', () => {
    const setup = [
      'git init',
      'echo "a1" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "a2" > a.txt',
      'git stash push',
    ]
    const r = exec([...setup, 'git stash apply'])
    expect(text(r.last)).toBe('')
    expect(text(exec([...setup, 'git stash apply', 'cat a.txt']).last)).toContain('a2')
    // entry kept
    expect(text(exec([...setup, 'git stash apply', 'git stash list']).last)).toContain('stash@{0}')
  })

  it('pop with empty stash -> No stash entries found', () => {
    const r = exec([...two(), 'git stash pop'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toContain('No stash entries found.')
  })

  it('apply with empty stash -> No stash entries found', () => {
    const r = exec([...two(), 'git stash apply'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toContain('No stash entries found.')
  })

  it('drop removes the entry', () => {
    const r = exec(['git init', 'echo "a1" > a.txt', 'git add a.txt', 'git commit -m c1', 'echo "a2" > a.txt', 'git stash push', 'git stash drop'])
    expect(text(r.last)).toContain('Dropped')
    expect(text(exec(['git init', 'echo "a1" > a.txt', 'git add a.txt', 'git commit -m c1', 'echo "a2" > a.txt', 'git stash push', 'git stash drop', 'git stash list']).last)).toBe('')
  })

  it('drop with empty stash -> No stash entries found', () => {
    const r = exec([...two(), 'git stash drop'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toContain('No stash entries found.')
  })

  it('drop with out-of-range ref -> not a valid reference', () => {
    const r = exec(['git init', 'echo "a1" > a.txt', 'git add a.txt', 'git commit -m c1', 'echo "a2" > a.txt', 'git stash push', 'git stash drop stash@{5}'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toContain("stash@{5} is not a valid reference")
  })

  it('pop conflict keeps the entry and reports the kept message', () => {
    const setup = [
      'git init',
      'echo "a1" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'echo "a2" > a.txt',
      'git stash push -m w',
      'echo "a4" > a.txt',
    ]
    const r = exec([...setup, 'git stash pop'])
    const t = text(r.last)
    expect(t).toContain('would be overwritten')
    expect(t).toContain('The stash entry is kept')
    // entry kept
    expect(text(exec([...setup, 'git stash pop', 'git stash list']).last)).toContain('stash@{0}')
    // workdir kept the local change
    expect(text(exec([...setup, 'git stash pop', 'cat a.txt']).last)).toContain('a4')
  })
})
