export interface HowDoI {
  id: string
  question: string
  keywords: string[]
  why: string
  commands: string[]
}

/**
 * The "How do I…?" hint library (local-only for M1). Each entry answers a
 * question the way a git tutorial would: `question` is what the user is trying
 * to do, `keywords` drive search, `why` is a one-line explanation, and
 * `commands[0]` is a concrete, ready-to-run command for the sandbox so "Try it"
 * fills the terminal with something that works.
 */
export const HOW_DO_I: HowDoI[] = [
  {
    id: 'undo-last-commit',
    question: 'undo the last commit but keep my changes',
    keywords: ['undo', 'uncommit', 'reset', 'soft', 'last commit'],
    why: '--soft moves HEAD back one commit but leaves everything staged, so nothing is lost.',
    commands: ['git reset --soft HEAD~1'],
  },
  {
    id: 'throwaway-file-changes',
    question: 'throw away my changes to a file',
    keywords: ['discard', 'revert', 'checkout', 'lose changes', 'forget changes'],
    why: 'git checkout -- <file> overwrites the working copy with the last committed version. The change is gone.',
    commands: ['git checkout -- notes.txt'],
  },
  {
    id: 'unstage-file',
    question: 'unstage a file',
    keywords: ['unstage', 'reset', 'remove from stage', 'undo add'],
    why: 'The file comes off the staging area but your edits stay in the working directory.',
    commands: ['git restore --staged notes.txt'],
  },
  {
    id: 'fix-last-commit-message',
    question: 'fix the last commit message',
    keywords: ['amend', 'message', 'typo', 'reword', 'edit commit'],
    why: '--amend replaces the tip commit with the new message; the tree is kept unchanged.',
    commands: ['git commit --amend -m "new message"'],
  },
  {
    id: 'see-what-changed',
    question: 'see what I changed',
    keywords: ['diff', 'changes', 'uncommitted', 'what changed', 'compare'],
    why: 'git diff shows the difference between the index and the working directory, hunk by hunk.',
    commands: ['git diff'],
  },
  {
    id: 'rename-branch',
    question: 'rename a branch',
    keywords: ['rename', 'branch', 'move', 'retitle', 'new name'],
    why: 'git branch -m <old> <new> points the branch at the same commit under a new name.',
    commands: ['git branch -m main feature'],
  },
  {
    id: 'delete-merged-branch',
    question: 'delete a merged branch',
    keywords: ['delete', 'remove', 'branch', 'merged', 'cleanup'],
    why: 'git branch -d only deletes a branch whose commits are all reachable from HEAD, so nothing unique is lost.',
    commands: ['git branch -d feature'],
  },
  {
    id: 'park-work',
    question: 'park my work for later (stash)',
    keywords: ['stash', 'park', 'save work', 'temporarily', 'later'],
    why: 'git stash push saves uncommitted changes and gives you a clean tree to work in; pop it back later.',
    commands: ['git stash push'],
  },
  {
    id: 'undo-commit-safely',
    question: 'undo a commit safely (revert)',
    keywords: ['revert', 'undo', 'safe', 'new commit', 'shared branch'],
    why: 'A revert adds a new commit that undoes the old one, so the shared history is never rewritten.',
    commands: ['git revert HEAD'],
  },
  {
    id: 'look-at-old-version',
    question: 'look at an old version (detached HEAD)',
    keywords: ['detached', 'old', 'history', 'inspect', 'browse', 'sha'],
    why: "Check out a commit directly, e.g. `git checkout 1d88b0b`, to read any old state without changing a branch. You'll be in 'detached HEAD'.",
    commands: ['git checkout HEAD~1'],
  },
  {
    id: 'bring-one-commit',
    question: 'bring one commit to my branch (cherry-pick)',
    keywords: ['cherry-pick', 'copy commit', 'single commit', 'pick'],
    why: 'Cherry-pick replays one commit from another branch as a new commit on your current branch.',
    commands: ['git cherry-pick other'],
  },
  {
    id: 'abort-messy-merge',
    question: 'abort a messy merge',
    keywords: ['abort', 'merge', 'conflict', 'messy', 'give up'],
    why: 'git merge --abort walks everything back to how things were before the merge started.',
    commands: ['git merge --abort'],
  },
]
