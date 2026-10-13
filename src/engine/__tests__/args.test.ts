import { describe, expect, it } from 'vitest'
import { parseArgs } from '../args'
import { GitError } from '../errors'

function errorLines(fn: () => unknown): string[] {
  try {
    fn()
  } catch (e) {
    if (e instanceof GitError) return e.lines
    throw e
  }
  throw new Error('expected a GitError')
}

describe('parseArgs', () => {
  it('splits combined short flags; a string flag takes the next argument', () => {
    expect(parseArgs(['-am', 'msg'], { bool: ['a'], string: ['m'] })).toEqual({
      flags: { a: true, m: 'msg' },
      positionals: [],
      afterDashDash: [],
    })
  })

  it('supports --opt=value with aliases', () => {
    expect(parseArgs(['--message=x'], { string: ['m'], alias: { message: 'm' } }).flags).toEqual({
      m: 'x',
    })
  })

  it('supports --opt value and short -mvalue', () => {
    const spec = { string: ['m'], alias: { message: 'm' } }
    expect(parseArgs(['--message', 'hello world'], spec).flags).toEqual({ m: 'hello world' })
    expect(parseArgs(['-mhi'], spec).flags).toEqual({ m: 'hi' })
  })

  it('collects everything after -- separately', () => {
    expect(parseArgs(['--', 'f.txt'], {})).toEqual({
      flags: {},
      positionals: [],
      afterDashDash: ['f.txt'],
    })
    expect(parseArgs(['main', '--', '-weird.txt', '--'], { bool: ['x'] })).toEqual({
      flags: {},
      positionals: ['main'],
      afterDashDash: ['-weird.txt', '--'],
    })
  })

  it('allows flags and positionals in any order', () => {
    expect(parseArgs(['a.txt', '-f', 'b.txt'], { bool: ['f'] })).toEqual({
      flags: { f: true },
      positionals: ['a.txt', 'b.txt'],
      afterDashDash: [],
    })
  })

  it('treats a lone - as a positional', () => {
    expect(parseArgs(['-'], {}).positionals).toEqual(['-'])
  })

  it('rejects unknown options like git does', () => {
    expect(errorLines(() => parseArgs(['--bogus'], { bool: ['a'] }))).toEqual([
      "error: unknown option '--bogus'",
    ])
    expect(errorLines(() => parseArgs(['-x'], { bool: ['a'] }))).toEqual([
      "error: unknown switch 'x'",
    ])
  })

  it('rejects a string option with no value', () => {
    expect(errorLines(() => parseArgs(['-m'], { string: ['m'] }))).toEqual([
      "error: switch 'm' requires a value",
    ])
    expect(
      errorLines(() => parseArgs(['--message'], { string: ['m'], alias: { message: 'm' } })),
    ).toEqual(["error: option 'message' requires a value"])
  })

  it('rejects a value given to a boolean long option', () => {
    expect(
      errorLines(() => parseArgs(['--all=yes'], { bool: ['A'], alias: { all: 'A' } })),
    ).toEqual(["error: option 'all' takes no value"])
  })
})
