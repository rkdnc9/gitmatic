export type Sha = string

/** path -> file content. Paths are flat file names (no subdirectories). */
export type Tree = Record<string, string>

export interface Commit {
  id: Sha
  parents: Sha[]
  message: string
  author: string
  time: number
  tree: Tree
}

export type Head = { type: 'branch'; name: string } | { type: 'detached'; commit: Sha }

export interface Pending {
  type: 'merge' | 'cherry-pick' | 'revert'
  theirs: Sha
  message: string
  conflicts: string[]
  origHead: Sha
  /** Merge "base" commit (cherry-pick: picked commit's parent; revert: the reverted commit). */
  base: Sha
  /** Workdir tree snapshot from before the operation, so `--abort` can restore it. */
  preWork: Record<string, string> | null
}

export interface StashEntry {
  /** 7-char commit-style id, generated at push time. */
  id: Sha
  message: string
  base: Sha
  index: Tree
  workdir: Tree
  branch: string
}

export interface WorktreeState {
  head: Head
  index: Tree
  pending: Pending | null
}

export interface Tag {
  target: Sha
  message: string | null
}

export interface Repo {
  root: string
  commits: Record<Sha, Commit>
  branches: Record<string, Sha>
  tags: Record<string, Tag>
  stash: StashEntry[]
  /** keyed by worktree path */
  worktrees: Record<string, WorktreeState>
}

export interface World {
  version: 1
  cwd: string
  /** directory path -> working tree */
  files: Record<string, Tree>
  repo: Repo | null
  clock: number
}

export interface OutputLine {
  text: string
  tone: 'out' | 'err' | 'hint' | 'ok'
}

export type Effect = { type: 'open-editor'; path: string } | { type: 'clear' }

export interface CommandResult {
  world: World
  output: OutputLine[]
  note: string | null
  effects: Effect[]
  ok: boolean
}
