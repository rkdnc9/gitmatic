import { produce } from 'immer'
import { GitError } from './errors'
import type { Ctx } from './run'
import type { Head, Repo, Sha, Tree, World, WorktreeState } from './types'

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

/**
 * Moves the current worktree's HEAD to `head` (a branch or a detached commit) and
 * resets the index and working tree to `target`'s tree, carrying over local
 * changes (untracked or modified) that don't conflict. Throws a GitError with
 * git's text when a local change would be overwritten.
 */
export function moveHeadTo(ctx: Ctx, target: Sha, head: Head): void {
  const w = ctx.w
  const repo = requireRepo(w)
  const wt = repo.worktrees[w.cwd]
  if (!wt) throw new GitError('fatal: not a git repository (or any of the parent directories): .git')

  const targetTree = repo.commits[target]?.tree ?? {}
  const oldHead = wt.head.type === 'branch' ? repo.branches[wt.head.name] ?? null : wt.head.commit
  const base = oldHead ? (repo.commits[oldHead]?.tree ?? {}) : {}
  const index = wt.index
  const work = workdir(w)

  // Two-way merge of base (old HEAD), ours (working tree) and theirs (target tree),
  // per path. Absent values compare as a distinct "deleted" state. A conflict where
  // the working tree holds a local change would be refused, like git.
  const keys = new Set<string>([...Object.keys(base), ...Object.keys(work), ...Object.keys(targetTree)])
  const trackedBlocked: string[] = []
  const untrackedBlocked: string[] = []
  for (const f of keys) {
    const b = base[f]
    const o = work[f]
    const t = targetTree[f]
    if (o !== undefined && b === undefined && !Object.hasOwn(index, f)) {
      if (t !== undefined) untrackedBlocked.push(f)
      continue
    }
    if (!(b === t) && !(b === o) && !(o === t) && o !== b) {
      trackedBlocked.push(f)
    }
  }

  if (trackedBlocked.length > 0) {
    trackedBlocked.sort()
    throw new GitError(
      [
        'error: Your local changes to the following files would be overwritten by checkout:',
        ...trackedBlocked.map((f) => `\t${f}`),
        'Please commit your changes or stash them before you switch branches.',
        'Aborting',
      ],
      [],
    )
  }
  if (untrackedBlocked.length > 0) {
    untrackedBlocked.sort()
    throw new GitError(
      [
        'error: The following untracked working tree files would be overwritten by checkout:',
        ...untrackedBlocked.map((f) => `\t${f}`),
        'Please move or remove them before you switch branches.',
        'Aborting',
      ],
      [],
    )
  }

  wt.head = head
  const newWork: Tree = {}
  for (const f of keys) {
    const b = base[f]
    const o = work[f]
    const t = targetTree[f]
    let val: string | undefined
    if (o !== undefined && b === undefined && !Object.hasOwn(index, f)) {
      val = t === undefined ? o : t
    } else if (b === t) {
      val = o
    } else if (b === o) {
      val = t
    } else {
      val = o === t ? o : t
    }
    if (val !== undefined) newWork[f] = val
  }
  wt.index = { ...targetTree }
  w.files[w.cwd] = newWork
}
