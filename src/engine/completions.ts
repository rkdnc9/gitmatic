import { SHELL_COMMANDS } from './shell'
import { tokenize } from './tokenize'
import { listGitCommands } from './run'
import type { World } from './types'
import { workdir } from './world'

/** Flags each git subcommand's parser accepts (offered for its operand slots). */
const GIT_FLAGS: Record<string, string[]> = {
  add: ['-A'],
  branch: ['-d', '-D', '-m', '--delete', '--force', '--move'],
  checkout: ['-b', '-d', '--detach'],
  commit: ['-a', '-m', '--all', '--amend', '--message'],
  diff: ['--cached', '--staged'],
  log: ['--all', '--graph', '--oneline'],
  merge: ['-m', '--abort', '--continue', '--no-ff', '--squash', '--message'],
  reset: ['--hard', '--mixed', '--soft'],
  restore: ['--source', '--staged'],
  revert: ['--abort', '--continue'],
  'cherry-pick': ['--abort', '--continue'],
  switch: ['-c', '-d', '--create', '--detach'],
}

const TOP_FLAGS: Record<string, string[]> = {
  ls: ['-a', '-A', '-l', '-1'],
  rm: ['-f', '-r', '-R'],
}

const STASH_SUBS: string[] = ['apply', 'drop', 'list', 'pop', 'push']

/** Git subcommands whose first positional is a branch name or revision. */
const REV_OPERAND: Record<string, true> = {
  switch: true,
  checkout: true,
  merge: true,
  reset: true,
  revert: true,
  'cherry-pick': true,
  show: true,
}

/** Git subcommands whose positionals are file paths. */
const FILE_OPERAND: Record<string, true> = { add: true, restore: true }

const TOP_FILE_CMDS: Record<string, true> = {
  cat: true,
  ls: true,
  rm: true,
  touch: true,
  edit: true,
}

const topLevel = (): string[] => ['git', ...Object.keys(SHELL_COMMANDS)].sort()
const byPrefix = (names: string[], partial: string): string[] =>
  names.filter((n) => n.startsWith(partial)).sort()

/** Resolve a possibly-partial subcommand to its unique full name, or null. */
function resolveSub(partial: string, subs: string[]): string | null {
  const matches = subs.filter((s) => s.startsWith(partial))
  return matches.length === 1
    ? matches[0]
    : matches.length > 1 && matches.includes(partial)
      ? partial
      : null
}

/**
 * Tab-completion candidates for a half-typed line. Returns the full candidate
 * words matching the last token, sorted; [] when there is nothing to complete.
 */
export function getCompletions(w: World, line: string): string[] {
  let tokens
  try {
    tokens = tokenize(line)
  } catch {
    return []
  }
  const files = Object.keys(workdir(w)).sort()

  // A `>` / `>>` makes the next word a file name.
  let lastRedirect = -1
  tokens.forEach((t, i) => {
    if (t.type === 'redirect') lastRedirect = i
  })
  if (lastRedirect !== -1) {
    if (tokens.at(-1)?.type === 'redirect') return files
    const lastWord = [...tokens].reverse().find((t) => t.type === 'word')
    if (lastWord) {
      const idx = tokens.indexOf(lastWord)
      if (idx > lastRedirect) return files.filter((f) => f.startsWith(lastWord.value))
    }
  }

  const words = tokens.filter((t) => t.type === 'word').map((t) => t.value)
  if (words.length === 0) return topLevel()

  const [cmd, ...rest] = words
  // Top-level command still being typed.
  if (!topLevel().includes(cmd)) return byPrefix(topLevel(), cmd)

  // A top-level file command: complete file names (or its flags).
  if (TOP_FILE_CMDS[cmd]) {
    const token = rest.at(-1) ?? ''
    if (token.startsWith('-')) return byPrefix(TOP_FLAGS[cmd] ?? [], token)
    return files.filter((f) => f.startsWith(token))
  }
  if (cmd !== 'git') return []

  // `git …`
  const subs = listGitCommands().sort()
  if (rest.length === 0) return subs
  const subToken = rest[0]
  if (rest.length === 1) {
    // Finished the subcommand (exact) → complete its first operand; else its name.
    if (!subs.includes(subToken)) return byPrefix(subs, subToken)
    return gitOperands(w, subToken, [], '')
  }
  const sub = resolveSub(subToken, subs)
  if (sub === null) return []
  return gitOperands(w, sub, rest.slice(1), rest.at(-1) ?? '')
}

function gitOperands(w: World, sub: string, pos: string[], token: string): string[] {
  const files = Object.keys(workdir(w)).sort()
  const pathspecCmd = FILE_OPERAND[sub] || sub === 'checkout' || sub === 'reset'
  // `--` starts the pathspec section (or was just typed).
  if (pathspecCmd && token === '--') return files
  if (token.startsWith('-')) return byPrefix(GIT_FLAGS[sub] ?? [], token)

  const dd = pos.indexOf('--')
  if (dd !== -1 && pathspecCmd) {
    return dd === pos.length - 1 ? files : files.filter((f) => f.startsWith(token))
  }
  if (FILE_OPERAND[sub]) return files.filter((f) => f.startsWith(token))

  if (sub === 'stash') {
    const refs = (w.repo?.stash ?? []).map((_, i) => `stash@{${i}}`)
    if (pos.length === 0) return byPrefix(STASH_SUBS, token)
    const action = pos[0]
    if (action === 'pop' || action === 'apply' || action === 'drop')
      return refs.filter((r) => r.startsWith(token))
    return []
  }

  if (REV_OPERAND[sub]) {
    if (!w.repo) return []
    return byPrefix([...Object.keys(w.repo.branches), 'HEAD'], token)
  }
  return []
}
