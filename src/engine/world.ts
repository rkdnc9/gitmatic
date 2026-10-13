import { produce } from 'immer'
import { GitError } from './errors'
import type { Repo, Tree, World, WorktreeState } from './types'

export const PROJECT_DIR = '/project'

export function createWorld(): World {
  return { version: 1, cwd: PROJECT_DIR, files: { [PROJECT_DIR]: {} }, repo: null, clock: 0 }
}

/** The working tree of the current directory. On a draft, the result is mutable. */
export function workdir(w: World): Tree {
  return w.files[w.cwd]
}

export function writeFile(w: World, path: string, content: string): World {
  return produce(w, (d) => {
    d.files[d.cwd][path] = content
  })
}

export function currentWorktree(w: World): WorktreeState | null {
  return w.repo?.worktrees[w.cwd] ?? null
}

export function requireRepo(w: World): Repo {
  if (!w.repo) {
    throw new GitError('fatal: not a git repository (or any of the parent directories): .git')
  }
  return w.repo
}

/**
 * Normalises a user-typed path to a flat file name: strips `./` and the cwd prefix.
 * Returns null for anything outside the flat toy directory (subdirectories, `..`, `.git`) and `__proto__`.
 */
export function normalizePath(w: World, path: string): string | null {
  let p = path
  if (p.startsWith(w.cwd + '/')) p = p.slice(w.cwd.length + 1)
  while (p.startsWith('./')) p = p.slice(2)
  if (p === '' || p === '.' || p === '..' || p === '.git' || p === '__proto__' || p.includes('/'))
    return null
  return p
}
