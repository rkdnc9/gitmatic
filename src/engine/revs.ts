import type { Repo, Sha, WorktreeState } from './types'

/**
 * Revision resolution and history helpers (git rev-parse style subset).
 */

/** Resolve `rev` to a commit id, or null when unknown.
 * Supports: HEAD, HEAD~n, X~n, X^, X^^, X^2 (second parent), branch names,
 * and any unique 4+ char prefix of a commit id. */
export function resolveRev(repo: Repo, wt: WorktreeState, rev: string): Sha | null {
  if (rev === '') return null
  // parseSteps handles ~ and ^ suffixes; nothing needed here.
  const steps = parseSteps(rev)
  if (steps === null) return null

  let start: Sha | null
  const { spec, up, caret2 } = steps
  if (spec === 'HEAD') {
    start = wt.head.type === 'branch' ? repo.branches[wt.head.name] ?? null : wt.head.commit
  } else if (Object.hasOwn(repo.branches, spec)) {
    start = repo.branches[spec] ?? null
  } else {
    start = findUniquePrefix(repo, spec)
  }
  if (start === null) return null

  let cur = start
  for (let i = 0; i < up; i++) {
    const commit = repo.commits[cur]
    if (!commit || commit.parents.length === 0) return null
    cur = commit.parents[0]
  }
  for (let i = 0; i < caret2; i++) {
    const commit = repo.commits[cur]
    if (!commit || commit.parents.length < 2) return null
    cur = commit.parents[1]
  }
  return cur
}

/** Parses a rev like `main`, `HEAD~3`, `abc1234^2`, `HEAD^^`. Returns null for garbage. */
function parseSteps(
  rev: string,
): { spec: string; up: number; caret2: number } | null {
  if (rev.includes('^{') || rev.includes(':')) return null
  let i = 0
  let spec = ''
  let up = 0
  let caret2 = 0
  let sawTilde = false
  let sawCaret = false
  const isStep = (ch: string) => ch === '~' || ch === '^'
  while (i < rev.length && !isStep(rev[i])) {
    spec += rev[i]
    i++
  }
  while (i < rev.length) {
    const ch = rev[i]
    if (ch === '~') {
      sawTilde = true
      if (sawCaret) return null
      i++
      let n = 0
      while (i < rev.length && rev[i] >= '0' && rev[i] <= '9') {
        n = n * 10 + (rev.charCodeAt(i) - 48)
        i++
      }
      if (n === 0) return null // a bare trailing `~` with no digits
      up += n
    } else if (ch === '^') {
      sawCaret = true
      if (sawTilde) return null
      i++
      if (i < rev.length && rev[i] === '^') {
        // `^^` = first parent twice
        if (caret2 > 0) return null
        up += 1
        i++
      } else if (i < rev.length && rev[i] === '2') {
        caret2 += 1
        i++
      } else if (i < rev.length && rev[i] >= '0' && rev[i] <= '9') {
        return null // ^3..^N unsupported
      } else if (i < rev.length && rev[i] !== '^') {
        return null
      } else if (i < rev.length) {
        up += 1
        i++
      } else {
        up += 1 // trailing `^`
      }
    } else {
      return null
    }
  }
  return { spec, up, caret2 }
}

/** Find a commit id by a unique 4+ char prefix. Returns null when none or ambiguous. */
function findUniquePrefix(repo: Repo, prefix: string): Sha | null {
  if (prefix.length < 4 || !/^[0-9a-f]+$/i.test(prefix)) return null
  const lower = prefix.toLowerCase()
  let found: Sha | null = null
  for (const id of Object.keys(repo.commits)) {
    if (id.startsWith(lower)) {
      if (found !== null) return null // ambiguous
      found = id
    }
  }
  return found
}

/** All commits reachable from `from` (walking parents), including the tips themselves. */
export function reachable(repo: Repo, from: Sha[]): Set<Sha> {
  const seen = new Set<Sha>()
  const stack = [...from]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const c = repo.commits[id]
    if (c) stack.push(...c.parents)
  }
  return seen
}

/** True when `ancestor` is an ancestor of (or equal to) `descendant`. */
export function isAncestor(repo: Repo, ancestor: Sha, descendant: Sha): boolean {
  return reachable(repo, [descendant]).has(ancestor)
}

/** Best common ancestor of two commits (first-parent-priority). Null when none. */
export function mergeBase(repo: Repo, a: Sha, b: Sha): Sha | null {
  const fromA = reachable(repo, [a])
  const fromB = reachable(repo, [b])
  const common: Sha[] = [...fromA].filter((id) => fromB.has(id))
  // Prefer the one closest to `a` (shortest first-parent distance); deterministic
  // fallback to lexical order for exact ties.
  const dist = new Map<Sha, number>()
  const walk = (start: Sha): void => {
    const stack: Array<[Sha, number]> = [[start, 0]]
    while (stack.length > 0) {
      const [id, d] = stack.pop()!
      if ((dist.get(id) ?? Infinity) <= d) continue
      dist.set(id, d)
      const c = repo.commits[id]
      if (c) {
        c.parents.forEach((p, idx) => stack.push([p, d + 1 + idx * 0.001]))
      }
    }
  }
  walk(a)
  common.sort((x, y) => (dist.get(x) ?? 0) - (dist.get(y) ?? 0) || (x < y ? -1 : 1))
  return common[0] ?? null
}

/** The commit HEAD points at; null on an unborn branch. */
export function headCommit(repo: Repo, wt: WorktreeState): Sha | null {
  if (wt.head.type === 'detached') return wt.head.commit
  return repo.branches[wt.head.name] ?? null
}
