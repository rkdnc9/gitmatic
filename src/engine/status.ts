import type { World } from './types'
import { workdir } from './world'

export type IndexState = 'added' | 'modified' | 'deleted' | null
export type WorkState = 'untracked' | 'modified' | 'deleted' | null

export interface StatusEntry {
  path: string
  index: IndexState
  work: WorkState
  conflicted: boolean
}

/**
 * Computes status for the current worktree, comparing the working tree, the
 * index and the HEAD tree per path. Returns [] when there is no repo, sorted
 * by path.
 */
export function getStatus(w: World): StatusEntry[] {
  const repo = w.repo
  if (!repo) return []
  const wt = repo.worktrees[w.cwd]
  if (!wt) return []

  const index = wt.index
  const work = workdir(w)
  const head =
    wt.head.type === 'branch' ? (repo.branches[wt.head.name] ?? null) : wt.head.commit
  const headTree = head ? (repo.commits[head]?.tree ?? {}) : {}
  const conflictedPaths = new Set(wt.pending?.conflicts ?? [])

  const paths = new Set<string>([
    ...Object.keys(headTree),
    ...Object.keys(index),
    ...Object.keys(work),
  ])
  const entries: StatusEntry[] = []

  for (const path of paths) {
    const inHead = Object.hasOwn(headTree, path)
    const inIndex = Object.hasOwn(index, path)
    const inWork = Object.hasOwn(work, path)

    let indexState: IndexState = null
    if (inHead && !inIndex) indexState = 'deleted'
    else if (!inHead && inIndex) indexState = 'added'
    else if (inHead && inIndex && index[path] !== headTree[path]) indexState = 'modified'

    let workState: WorkState = null
    if (!inIndex && inWork) workState = 'untracked'
    else if (inIndex && !inWork) workState = 'deleted'
    else if (inIndex && inWork && work[path] !== index[path]) workState = 'modified'

    if (indexState === null && workState === null) continue
    entries.push({
      path,
      index: indexState,
      work: workState,
      conflicted: conflictedPaths.has(path),
    })
  }

  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return entries
}