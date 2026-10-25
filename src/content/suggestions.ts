import { getStatus, headCommit } from '../engine'
import { currentWorktree } from '../engine/world'
import type { World } from '../engine'

/**
 * Up to four "next command" chips for the terminal, derived from the world.
 *
 * Priority: a blocked operation (merge conflicts) wins, then staged changes
 * (commit), then uncommitted work (status/add), then a clean history
 * (log/branch). Each suggestion is a complete command the user can run as-is.
 */
export function suggestCommands(w: World): string[] {
  const repo = w.repo
  if (!repo) return ['git init']
  const wt = currentWorktree(w)
  if (!wt) return []

  const entries = getStatus(w)
  const conflicted = entries.find((e) => e.conflicted)
  if (conflicted) {
    return [`edit ${conflicted.path}`, `git add ${conflicted.path}`, 'git merge --abort']
  }

  const staged = entries.some((e) => e.index !== null)
  if (staged) return ['git commit -m "describe your change"']

  const dirty = entries.find((e) => e.work === 'untracked' || e.work === 'modified')
  if (dirty) return ['git status', `git add ${dirty.path}`]

  if (headCommit(repo, wt) === null) return []
  return ['git log --oneline', 'git switch -c feature']
}
