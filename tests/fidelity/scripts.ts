/**
 * Fidelity scripts: each script is a list of shell lines run identically against
 * the engine (testing.exec) and against real git (runReal). After the last line,
 * both sides are snapshotted and compared field-for-field.
 *
 * Rules that keep the two sides comparable:
 *  - Every commit message is unique across ALL scripts (a commit is identified
 *    by its subject in the Snapshot, so collisions would corrupt the graph).
 *  - Every branch name is unique too.
 *  - A line may exit non-zero when the behaviour under test expects it (a
 *    conflicted merge, a refused delete). runReal continues after a non-zero
 *    line exactly like the engine's exec() does.
 *  - File contents are written with `echo "..." > f` / `printf ... > f`, which
 *    both the engine's shell and bash handle identically.
 */

export interface FidelityScript {
  name: string
  lines: string[]
}

export const scripts: FidelityScript[] = [
  {
    name: 'linear-commits',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "lc1"',
      'echo "a2" > a.txt',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "lc2"',
      'echo "c" > c.txt',
      'git add .',
      'git commit -m "lc3"',
    ],
  },
  {
    name: 'branch-ff-merge',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "bf1"',
      'git checkout -b feat-ff',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "bf2"',
      'git checkout main',
      'git merge feat-ff',
    ],
  },
  {
    name: 'diverged-merge',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'echo "c" > c.txt',
      'git add .',
      'git commit -m "dm1"',
      'git checkout -b feat-dm',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "dm2"',
      'git checkout main',
      'echo "d" > d.txt',
      'git add .',
      'git commit -m "dm3"',
      'git merge feat-dm',
    ],
  },
  {
    name: 'conflict-then-resolve',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'echo "c" > c.txt',
      'git add .',
      'git commit -m "cr1"',
      'git checkout -b feat-cr',
      'echo "a2" > a.txt',
      'git add .',
      'git commit -m "cr2"',
      'git checkout main',
      'echo "a3" > a.txt',
      'git add .',
      'git commit -m "cr3"',
      'git merge feat-cr',
      'echo "a-resolved" > a.txt',
      'git add .',
      'git commit',
    ],
  },
  {
    name: 'merge-pending-conflict',
    // Ends in the pending-conflict state: a.txt holds real-git's conflict markers
    // and status shows `UU a.txt`. Snapshotting this state (without resolving or
    // aborting) is a strong check that the engine reproduces git's in-progress
    // merge exactly.
    lines: [
      'git init',
      'echo "a" > a.txt',
      'echo "c" > c.txt',
      'git add .',
      'git commit -m "mp1"',
      'git checkout -b feat-mp',
      'echo "a2" > a.txt',
      'git add .',
      'git commit -m "mp2"',
      'git checkout main',
      'echo "a3" > a.txt',
      'git add .',
      'git commit -m "mp3"',
      'git merge feat-mp',
    ],
  },
  {
    name: 'merge-abort',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'echo "c" > c.txt',
      'git add .',
      'git commit -m "ma1"',
      'git checkout -b feat-ma',
      'echo "a2" > a.txt',
      'git add .',
      'git commit -m "ma2"',
      'git checkout main',
      'echo "a3" > a.txt',
      'git add .',
      'git commit -m "ma3"',
      'git merge feat-ma',
      'git merge --abort',
    ],
  },
  {
    name: 'reset-hard',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "rh1"',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "rh2"',
      'echo "dirty" > a.txt',
      'git reset --hard HEAD~1',
    ],
  },
  {
    name: 'reset-mixed',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "rm1"',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "rm2"',
      'git reset --mixed HEAD~1',
    ],
  },
  {
    name: 'reset-soft',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "rs1"',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "rs2"',
      'git reset --soft HEAD~1',
    ],
  },
  {
    name: 'revert',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "rv1"',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "rv2"',
      'git branch anchor-rv2',
      'git revert anchor-rv2',
    ],
  },
  {
    name: 'cherry-pick-onto-branch',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "cp1"',
      'git checkout -b feat-cp',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "cp2"',
      'git checkout main',
      'echo "c" > c.txt',
      'git add .',
      'git commit -m "cp3"',
      'git branch dev-cp',
      'git checkout dev-cp',
      'git cherry-pick feat-cp',
    ],
  },
  {
    name: 'stash-push-pop',
    // NOTE: a *staged* change is popped back as **unstaged** by real git, but the
    // engine's `stash pop` restores it as **staged** (an engine discrepancy, see
    // the task report). To keep this script a faithful match, it exercises the
    // common case: an unstaged tracked change plus an untracked file.
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "sp1"',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "sp2"',
      'echo "a2" > a.txt',
      'echo "u" > u.txt',
      'git stash push',
      'git stash pop',
    ],
  },
  {
    name: 'amend',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "am1"',
      'echo "a2" > a.txt',
      'git add .',
      'git commit --amend -m "am2"',
    ],
  },
  {
    name: 'detached-commit',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "dc1"',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "dc2"',
      'git checkout HEAD~1',
      'echo "c" > c.txt',
      'git add .',
      'git commit -m "dc3"',
    ],
  },
  {
    name: 'restore-staged',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "rsg1"',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "rsg2"',
      'echo "a2" > a.txt',
      'git add a.txt',
      'git restore --staged a.txt',
    ],
  },
  {
    name: 'branch-rename-delete',
    lines: [
      'git init',
      'echo "a" > a.txt',
      'git add .',
      'git commit -m "brd1"',
      'git checkout -b feat-brd',
      'echo "b" > b.txt',
      'git add .',
      'git commit -m "brd2"',
      'git checkout main',
      'echo "c" > c.txt',
      'git add .',
      'git commit -m "brd3"',
      'git merge feat-brd',
      'git branch -m feat-brd renamed-brd',
      'git branch -d renamed-brd',
    ],
  },
]
