import { produce, type Draft } from 'immer'
import { GitError } from './errors'
import { SHELL_COMMANDS } from './shell'
import { tokenize, type Token } from './tokenize'
import type { CommandResult, Effect, OutputLine, World } from './types'
import { normalizePath, workdir } from './world'

export interface Ctx {
  w: Draft<World>
  out(text: string, tone?: OutputLine['tone']): void
  note(text: string): void
  effect(e: Effect): void
}

export type CommandFn = (ctx: Ctx, argv: string[]) => void

const gitCommands = new Map<string, CommandFn>()

/** Commands register themselves (via commands/index.ts) under their git subcommand name. */
export function registerGit(name: string, fn: CommandFn): void {
  gitCommands.set(name, fn)
}
export function listGitCommands(): string[] {
  return [...gitCommands.keys()]
}

/** Every subcommand in the spec's v1 scope (§6.2); ones not registered yet get a friendly "not yet". */
const PLANNED = new Set([
  'init', 'clone', 'status', 'add', 'commit', 'log', 'diff', 'restore', 'switch', 'checkout',
  'branch', 'merge', 'rebase', 'revert', 'reset', 'stash', 'tag', 'remote', 'fetch', 'pull',
  'push', 'cherry-pick', 'worktree', 'show',
]) // prettier-ignore

const RARELY_NEEDED = "it's rarely needed day to day"

/** Real git subcommands outside gitmatic's scope, with a pointer to what to do instead. */
const NOT_SIMULATED = new Map<string, string>([
  ['config', 'gitmatic always commits as You <you@gitmatic.dev>'],
  ['rm', 'delete the file with rm <file>, then stage that with git add <file>'],
  ['mv', 'rename by creating the new file and removing the old one, then git add both'],
  ['clean', 'remove untracked files with rm <file>'],
  ...[
    'bisect', 'submodule', 'reflog', 'filter-branch', 'sparse-checkout', 'gc', 'blame', 'am',
    'apply', 'archive', 'bundle', 'describe', 'format-patch', 'fsck', 'grep', 'notes', 'prune',
    'range-diff', 'repack', 'replace', 'request-pull', 'rerere', 'send-email', 'shortlog',
    'subtree', 'whatchanged', 'maintenance', 'lfs', 'difftool', 'mergetool', 'gui', 'citool',
    'instaweb', 'svn', 'p4', 'filter-repo',
  ].map((sub): [string, string] => [sub, RARELY_NEEDED]), // prettier-ignore
])

const EDITORS = new Set(['vim', 'vi', 'nvim', 'nano', 'emacs', 'code', 'notepad', 'subl'])

type Resolved =
  { kind: 'run'; fn: CommandFn; argv: string[] } | { kind: 'info'; lines: OutputLine[] }

const out = (text: string): OutputLine => ({ text, tone: 'out' })
const hint = (text: string): OutputLine => ({ text, tone: 'hint' })

function resolveGit(argv: string[]): Resolved {
  const usage = [
    out('usage: git <command> [<args>]'),
    hint("Run 'git help' to see the commands gitmatic supports."),
  ]
  const sub = argv[0]
  if (sub === undefined) return { kind: 'info', lines: usage }
  if (sub.startsWith('-')) {
    if (sub === '--version' || sub === '-v') {
      return { kind: 'info', lines: [out('git version 2.47.0 (simulated by gitmatic)')] }
    }
    const help = gitCommands.get('help')
    if (sub === '--help' || sub === '-h') {
      return help ? { kind: 'run', fn: help, argv: argv.slice(1) } : { kind: 'info', lines: usage }
    }
    throw new GitError(`unknown option: ${sub}`, [usage[0].text, usage[1].text])
  }
  const fn = gitCommands.get(sub)
  if (fn) {
    const rest = argv.slice(1)
    if (rest.includes('--help') || rest.includes('-h')) {
      const help = gitCommands.get('help')
      if (help) return { kind: 'run', fn: help, argv: [sub] }
    }
    return { kind: 'run', fn, argv: rest }
  }
  const reason = NOT_SIMULATED.get(sub)
  if (reason) {
    return { kind: 'info', lines: [out(`gitmatic doesn't simulate 'git ${sub}' — ${reason}.`)] }
  }
  if (PLANNED.has(sub)) {
    return { kind: 'info', lines: [out(`gitmatic doesn't simulate 'git ${sub}' yet.`)] }
  }
  throw new GitError(`git: '${sub}' is not a git command. See 'git help'.`)
}

function resolve(argv: string[]): Resolved {
  const [cmd, ...rest] = argv
  if (cmd === 'git') return resolveGit(rest)
  if (Object.hasOwn(SHELL_COMMANDS, cmd))
    return { kind: 'run', fn: SHELL_COMMANDS[cmd], argv: rest }
  const available = ['git', ...Object.keys(SHELL_COMMANDS)].join(', ')
  throw new GitError(`${cmd}: command not found`, [
    EDITORS.has(cmd)
      ? 'Use edit <file> to open a file in the editor.'
      : `Commands you can use here: ${available}.`,
  ])
}

interface Redirect {
  path: string
  append: boolean
}

function splitRedirect(tokens: Token[]): { argv: string[]; redirect: Redirect | null } {
  const argv: string[] = []
  let redirect: { raw: string; append: boolean } | null = null
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type === 'word') {
      argv.push(t.value)
      continue
    }
    const next = tokens[i + 1]
    if (!next || next.type !== 'word') {
      throw new GitError(
        `syntax error near unexpected token '${next ? (next.append ? '>>' : '>') : 'newline'}'`,
        ['Put a file name after > or >>, e.g. echo "hello" > notes.txt'],
      )
    }
    if (redirect) throw new GitError('gitmatic: only one > or >> per command is supported')
    redirect = { raw: next.value, append: t.append }
    i++
  }
  return { argv, redirect: redirect && { path: redirect.raw, append: redirect.append } }
}

function unchanged(world: World, output: OutputLine[], ok: boolean): CommandResult {
  return { world, output, note: null, effects: [], ok }
}

/**
 * Runs one command line against `world`. Pure: returns a new World on success; on any
 * failure returns the original world untouched with the error lines.
 */
export function runCommand(world: World, line: string): CommandResult {
  try {
    const { argv, redirect } = splitRedirect(tokenize(line))
    if (argv[0] === '$') argv.shift()
    if (argv.length === 0 && !redirect) return unchanged(world, [], true)
    if (argv.length === 0) throw new GitError("syntax error near unexpected token 'newline'")

    const target = redirect && normalizePath(world, redirect.path)
    if (redirect && !target) {
      throw new GitError(`${redirect.path}: No such file or directory`, [
        'Files here live in one flat folder; use a plain name like notes.txt.',
      ])
    }

    const resolved = resolve(argv)
    if (resolved.kind === 'info') return unchanged(world, resolved.lines, true)

    const output: OutputLine[] = []
    const captured: string[] = []
    const effects: Effect[] = []
    let note: string | null = null
    const next = produce(world, (w) => {
      const ctx: Ctx = {
        w,
        out(text, tone = 'out') {
          if (target && tone === 'out') captured.push(text)
          else output.push({ text, tone })
        },
        note(text) {
          note = text
        },
        effect(e) {
          effects.push(e)
        },
      }
      resolved.fn(ctx, resolved.argv)
      if (redirect && target) {
        const tree = workdir(w)
        const written = captured.map((l) => l + '\n').join('')
        tree[target] =
          redirect.append && Object.hasOwn(tree, target) ? tree[target] + written : written
      }
      w.clock += 1
    })
    return { world: next, output, note, effects, ok: true }
  } catch (e) {
    if (e instanceof GitError) {
      return unchanged(
        world,
        [...e.lines.map((text): OutputLine => ({ text, tone: 'err' })), ...e.hints.map(hint)],
        false,
      )
    }
    const detail = e instanceof Error ? e.message : String(e)
    return unchanged(
      world,
      [{ text: `gitmatic hit an internal error running that command (${detail}).`, tone: 'err' }],
      false,
    )
  }
}
