import { GitError } from './errors'

/** Option names without dashes: one letter = short (`-m`), longer = long (`--amend`). */
export interface ArgSpec {
  bool?: string[]
  string?: string[]
  /** alternate name -> canonical name, e.g. `{ message: 'm' }` */
  alias?: Record<string, string>
}

export interface ParsedArgs {
  flags: Record<string, string | boolean>
  positionals: string[]
  afterDashDash: string[]
}

export function parseArgs(argv: string[], spec: ArgSpec): ParsedArgs {
  const bools = new Set(spec.bool ?? [])
  const strings = new Set(spec.string ?? [])
  const canonical = (name: string) => spec.alias?.[name] ?? name
  const flags: ParsedArgs['flags'] = {}
  const positionals: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') {
      return { flags, positionals, afterDashDash: argv.slice(i + 1) }
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
      const key = canonical(name)
      if (strings.has(key)) {
        if (eq !== -1) flags[key] = arg.slice(eq + 1)
        else if (i + 1 < argv.length) flags[key] = argv[++i]
        else throw new GitError(`error: option '${name}' requires a value`)
      } else if (bools.has(key)) {
        if (eq !== -1) throw new GitError(`error: option '${name}' takes no value`)
        flags[key] = true
      } else {
        throw new GitError(`error: unknown option '${eq === -1 ? arg : arg.slice(0, eq)}'`)
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      for (let j = 1; j < arg.length; j++) {
        const key = canonical(arg[j])
        if (bools.has(key)) {
          flags[key] = true
        } else if (strings.has(key)) {
          const rest = arg.slice(j + 1)
          if (rest) flags[key] = rest
          else if (i + 1 < argv.length) flags[key] = argv[++i]
          else throw new GitError(`error: switch '${arg[j]}' requires a value`)
          break
        } else {
          throw new GitError(`error: unknown switch '${arg[j]}'`)
        }
      }
    } else {
      positionals.push(arg)
    }
  }
  return { flags, positionals, afterDashDash: [] }
}
