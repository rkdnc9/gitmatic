/**
 * Fidelity harness: compare the gitmatic engine's World against real git's state
 * after running the same sequence of commands.
 *
 * The Snapshot intentionally contains NO raw commit ids, no timestamps, and no
 * shas — only commit subjects and structural relationships (parents are named
 * by their subject). This is what makes the engine (whose ids are 7-char cyrb53
 * hashes and whose clock is a command counter) comparable to real git (whose
 * shas are 40-hex and whose metadata is the pinned env date).
 *
 * A commit is identified only by its subject line (`%s`). Test scripts MUST use
 * unique commit subjects (and unique branch names) so the id-by-subject mapping
 * is unambiguous.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { reachable } from '../../src/engine/revs'
import type { World } from '../../src/engine/types'

export interface Tree {
  [path: string]: string
}

export interface GraphNode {
  msg: string
  parents: string[]
}

export interface Snapshot {
  /** Branch name, or `detached:<subject>` when HEAD is detached. */
  head: string
  /** branch name -> tip commit subject. */
  branches: Record<string, string>
  /** Every reachable commit, as `{msg, parentMsgs[]}`, sorted by msg. */
  graph: GraphNode[]
  /** `git status --porcelain=v1` lines, sorted. */
  status: string[]
  /** Working-tree file contents, path -> content (tracked + untracked). */
  files: Tree
}
/**
 * Deterministic order for the graph: primary key is the commit subject, then the
 * parent subjects (so two commits that share a subject — e.g. a cherry-picked
 * commit and its source — still sort in a reproducible order on both sides).
 */
function compareGraph(a: GraphNode, b: GraphNode): number {
  const pa = a.parents.join('\u0000')
  const pb = b.parents.join('\u0000')
  if (a.msg !== b.msg) return a.msg < b.msg ? -1 : 1
  if (pa !== pb) return pa < pb ? -1 : 1
  return 0
}

// Deterministic real-git environment: identity, default branch, pinned dates,
// and no user/system/global config leaking in. `HOME` points nowhere so a
// global config can never influence the result.
const GIT_DATE = '2026-10-01T00:00:00'
export const GIT_ENV: Record<string, string> = {
  ...process.env,
  HOME: '/nonexistent-gitmatic-home',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_DATE: GIT_DATE,
  GIT_COMMITTER_DATE: GIT_DATE,
  GIT_AUTHOR_NAME: 'You',
  GIT_AUTHOR_EMAIL: 'you@gitmatic.dev',
  GIT_COMMITTER_NAME: 'You',
  GIT_COMMITTER_EMAIL: 'you@gitmatic.dev',
  GIT_CONFIG_COUNT: '4',
  GIT_CONFIG_KEY_0: 'init.defaultBranch',
  GIT_CONFIG_VALUE_0: 'main',
  GIT_CONFIG_KEY_1: 'user.name',
  GIT_CONFIG_VALUE_1: 'You',
  GIT_CONFIG_KEY_2: 'user.email',
  GIT_CONFIG_VALUE_2: 'you@gitmatic.dev',
  GIT_CONFIG_KEY_3: 'advice.detachedHead',
  GIT_CONFIG_VALUE_3: 'false',
  GIT_TERMINAL_PROMPT: '0',
  GIT_EDITOR: 'true',
}

function spawnGit(args: string[], cwd?: string): { status: number | null; stdout: string } {
  const r = spawnSync('git', cwd ? ['-C', cwd, ...args] : args, {
    encoding: 'utf8',
    env: GIT_ENV,
    input: '',
  })
  return { status: r.status, stdout: r.stdout ?? '' }
}

/** Run a git command; throws when it exits non-zero. */
function git(dir: string, args: string[]): string {
  const { status, stdout } = spawnGit(args, dir)
  if (status !== 0) throw new Error(`git ${args.join(' ')} failed (exit ${status})`)
  return stdout
}

function splitLines(s: string): string[] {
  const lines = s.split('\n')
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Current branch name, or null when HEAD is detached. */
function gitHeadBranch(dir: string): string | null {
  const { status, stdout } = spawnGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], dir)
  if (status !== 0) return null
  const name = stdout.trim()
  return name === '' ? null : name
}

/** The commit at `sha`'s subject; '' when `sha` is empty. */
function subjectAt(dir: string, sha: string): string {
  if (sha === '') return ''
  return git(dir, ['log', '-1', '--format=%s', sha]).replace(/\n+$/, '')
}

/** branch name -> tip commit subject. */
function gitBranches(dir: string): Record<string, string> {
  const raw = git(dir, [
    'for-each-ref',
    '--format=%(refname:short)%00%(objectname)',
    'refs/heads',
  ])
  const out: Record<string, string> = {}
  for (const line of splitLines(raw)) {
    const i = line.indexOf('\u0000')
    if (i < 0) continue
    out[line.slice(0, i)] = subjectAt(dir, line.slice(i + 1).trim())
  }
  return out
}

/**
 * Every commit reachable from any ref (branches, tags, HEAD, stash bases) as
 * `{msg, parentMsgs[]}`, sorted by msg.
 *
 * Uses `rev-list --all --format=tformat:%H%x00%P%x00%s`. rev-list prints a
 * `commit <sha>` preamble line before each record, so only lines containing a
 * NUL are records and the preamble lines are ignored.
 */
function gitGraph(dir: string): GraphNode[] {
  const raw = git(dir, ['rev-list', '--all', '--format=tformat:%H%x00%P%x00%s'])
  const shaToMsg = new Map<string, string>()
  const records: { parents: string[]; msg: string }[] = []
  for (const line of raw.split('\n')) {
    const parts = line.split('\u0000')
    if (parts.length < 3) continue
    const sha = parts[0]
    const parents = parts[1].trim() === '' ? [] : parts[1].trim().split(' ')
    const msg = parts.slice(2).join('\u0000')
    shaToMsg.set(sha, msg)
    records.push({ parents, msg })
  }
  const nodes = records.map((r) => ({
    msg: r.msg,
    parents: r.parents.map((p) => shaToMsg.get(p) ?? ''),
  }))
  nodes.sort(compareGraph)
  return nodes
}

/** `git status --porcelain=v1` lines, sorted. */
function gitStatus(dir: string): string[] {
  const raw = git(dir, ['status', '--porcelain=v1'])
  return splitLines(raw).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Working-tree contents: tracked files (from `git ls-files`) plus untracked
 * files (from `git ls-files --others`, WITHOUT --exclude-standard so git's
 * ignore rules do not hide files the engine would still list). The engine's
 * `world.files` holds the flat working tree including untracked files, so the
 * snapshot matches it (decision documented in the task notes).
 */
function gitFiles(dir: string): Tree {
  const tracked = splitLines(git(dir, ['ls-files']))
  const untracked = splitLines(git(dir, ['ls-files', '--others']))
  const files: Tree = {}
  for (const p of [...tracked, ...untracked]) {
    files[p] = readFileSync(path.join(dir, p), 'utf8')
  }
  return files
}

/** Build a Snapshot by reading real git state from the repo at `dir`. */
export function snapshotReal(dir: string): Snapshot {
  const branch = gitHeadBranch(dir)
  let head: string
  if (branch !== null) {
    head = branch
  } else {
    const { status, stdout } = spawnGit(['rev-parse', 'HEAD'], dir)
    const sha = status === 0 ? stdout.trim() : ''
    head = sha === '' ? 'detached:' : `detached:${subjectAt(dir, sha)}`
  }
  return {
    head,
    branches: gitBranches(dir),
    graph: gitGraph(dir),
    status: gitStatus(dir),
    files: gitFiles(dir),
  }
}

/**
 * Build a Snapshot from the engine's World. Mirrors snapshotReal field-for-field
 * and never reads commit ids or timestamps: every id is translated to its
 * subject via `repo.commits[id].message.split('\n')[0]`, so the snapshot is
 * independent of the engine's internal 7-char ids and command-counter clock.
 */
export function snapshotSim(w: World): Snapshot {
  const repo = w.repo
  const work = w.files[w.cwd] ?? {}
  const wt = repo?.worktrees[w.cwd] ?? null

  let head: string
  let headSha: string | null = null
  if (!repo || !wt) {
    head = '(no-repo)'
  } else if (wt.head.type === 'branch') {
    head = wt.head.name
    headSha = repo.branches[wt.head.name] ?? null
  } else {
    headSha = wt.head.commit
    head = `detached:${headSha ? (repo.commits[headSha]?.message.split('\n')[0] ?? '') : ''}`
  }

  const subj = (id: string): string => (repo!.commits[id]?.message.split('\n')[0] ?? '')

  const branches: Record<string, string> = {}
  if (repo) {
    for (const [name, tip] of Object.entries(repo.branches)) branches[name] = subj(tip)
  }

  const graph: GraphNode[] = []
  if (repo) {
    const from: string[] = []
    for (const tip of Object.values(repo.branches)) if (tip) from.push(tip)
    for (const tag of Object.values(repo.tags)) from.push(tag.target)
    if (headSha) from.push(headSha)
    for (const s of repo.stash) from.push(s.base)
    const ids = reachable(repo, from)
    for (const id of ids) {
      const c = repo.commits[id]
      if (!c) continue
      graph.push({ msg: c.message.split('\n')[0], parents: c.parents.map((p) => subj(p)) })
    }
    graph.sort(compareGraph)
  }

  const status: string[] = []
  if (repo && wt) {
    const index = wt.index
    const headId = wt.head.type === 'branch' ? (repo.branches[wt.head.name] ?? null) : wt.head.commit
    const headTree = headId ? (repo.commits[headId]?.tree ?? {}) : {}
    const conflicted = new Set(wt.pending?.conflicts ?? [])
    const paths = new Set<string>([
      ...Object.keys(headTree),
      ...Object.keys(index),
      ...Object.keys(work),
      ...conflicted,
    ])
    for (const p of paths) {
      const inHead = Object.hasOwn(headTree, p)
      const inIndex = Object.hasOwn(index, p)
      const inWork = Object.hasOwn(work, p)
      if (conflicted.has(p)) {
        status.push(`UU ${p}`)
        continue
      }
      // Untracked (in workdir, not in HEAD or index): porcelain shows `??`.
      if (!inHead && !inIndex && inWork) {
        status.push(`?? ${p}`)
        continue
      }
      let xc: string
      if (!inHead && inIndex) xc = 'A'
      else if (inHead && !inIndex) xc = 'D'
      else if (inHead && inIndex && index[p] !== headTree[p]) xc = 'M'
      else xc = ' '
      let yc: string
      if (inIndex && !inWork) yc = 'D'
      else if (inIndex && inWork && work[p] !== index[p]) yc = 'M'
      else yc = ' '
      if (xc === ' ' && yc === ' ') continue
      status.push(`${xc}${yc} ${p}`)
    }
    status.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  }

  return { head, branches, graph, status, files: { ...work } }
}
