import { GitError } from './errors'
import type { CommandFn, Ctx } from './run'
import { normalizePath, workdir } from './world'

const FLAT_HINT = 'Files here live in one flat folder; use a plain name like notes.txt.'

function fileName(ctx: Ctx, raw: string, error: string): string {
  const path = normalizePath(ctx.w, raw)
  if (!path) throw new GitError(error, [FLAT_HINT])
  return path
}

/** Splits `-abc`-style flags from operands, validating letters against `allowed`. */
function shellFlags(
  cmd: string,
  argv: string[],
  allowed: string,
): { flags: Set<string>; operands: string[] } {
  const flags = new Set<string>()
  const operands: string[] = []
  let flagsDone = false
  for (const arg of argv) {
    if (!flagsDone && arg === '--') {
      flagsDone = true
    } else if (!flagsDone && arg.startsWith('-') && arg.length > 1) {
      for (const c of arg.slice(1)) {
        if (!allowed.includes(c)) throw new GitError(`${cmd}: invalid option -- '${c}'`)
        flags.add(c)
      }
    } else {
      operands.push(arg)
    }
  }
  return { flags, operands }
}

function contentLines(content: string): string[] {
  if (content === '') return []
  return (content.endsWith('\n') ? content.slice(0, -1) : content).split('\n')
}

const ls: CommandFn = (ctx, argv) => {
  const { flags, operands } = shellFlags('ls', argv, 'alA1')
  const tree = workdir(ctx.w)
  let names: string[]
  if (operands.length > 0) {
    names = operands.map((raw) => {
      const path = normalizePath(ctx.w, raw)
      if (path === null || !Object.hasOwn(tree, path)) {
        throw new GitError(`ls: cannot access '${raw}': No such file or directory`)
      }
      return path
    })
  } else {
    names = Object.keys(tree)
    if (flags.has('a') || flags.has('A')) {
      if (ctx.w.repo) names.push('.git')
      if (flags.has('a')) names.push('.', '..')
    }
  }
  names.sort()
  if (names.length === 0) return
  if (flags.has('l') || flags.has('1')) names.forEach((n) => ctx.out(n))
  else ctx.out(names.join('  '))
}

const cat: CommandFn = (ctx, argv) => {
  if (argv.length === 0) throw new GitError('cat: missing file operand', ['Usage: cat <file>'])
  const tree = workdir(ctx.w)
  const lines = argv.flatMap((raw) => {
    const path = normalizePath(ctx.w, raw)
    if (path === null || !Object.hasOwn(tree, path)) {
      throw new GitError(`cat: ${raw}: No such file or directory`)
    }
    return contentLines(tree[path])
  })
  lines.forEach((l) => ctx.out(l))
}

const touch: CommandFn = (ctx, argv) => {
  if (argv.length === 0) throw new GitError('touch: missing file operand', ['Usage: touch <file>'])
  const tree = workdir(ctx.w)
  for (const raw of argv) {
    const path = fileName(ctx, raw, `touch: cannot touch '${raw}': No such file or directory`)
    if (!Object.hasOwn(tree, path)) tree[path] = ''
  }
}

const echo: CommandFn = (ctx, argv) => {
  ctx.out(argv.join(' '))
}

const rm: CommandFn = (ctx, argv) => {
  const { flags, operands } = shellFlags('rm', argv, 'frR')
  if (operands.length === 0) throw new GitError('rm: missing operand', ['Usage: rm <file>'])
  const force = flags.has('f')
  const recursive = flags.has('r') || flags.has('R')
  const tree = workdir(ctx.w)
  for (const raw of operands) {
    const bare = raw.replace(/^(\.\/)+/, '')
    if (bare === '.git' && ctx.w.repo) {
      if (!recursive) throw new GitError(`rm: cannot remove '${raw}': Is a directory`)
      ctx.w.repo = null
      ctx.note(
        'Deleted .git — this folder is no longer a git repository; your files are untouched.',
      )
      continue
    }
    const path = normalizePath(ctx.w, raw)
    if (path === null || !Object.hasOwn(tree, path)) {
      if (force) continue
      throw new GitError(`rm: cannot remove '${raw}': No such file or directory`)
    }
    delete tree[path]
  }
}

const pwd: CommandFn = (ctx) => {
  ctx.out(ctx.w.cwd)
}

const clear: CommandFn = (ctx) => {
  ctx.effect({ type: 'clear' })
}

const edit: CommandFn = (ctx, argv) => {
  if (argv.length !== 1) {
    throw new GitError(argv.length ? 'edit: one file at a time' : 'edit: missing file operand', [
      'Usage: edit <file>',
    ])
  }
  const path = fileName(ctx, argv[0], `edit: ${argv[0]}: No such file or directory`)
  const tree = workdir(ctx.w)
  if (!Object.hasOwn(tree, path)) tree[path] = ''
  ctx.effect({ type: 'open-editor', path })
}

export const SHELL_COMMANDS: Record<string, CommandFn> = {
  ls,
  cat,
  touch,
  echo,
  rm,
  pwd,
  clear,
  edit,
}
