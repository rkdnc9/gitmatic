import { describe, expect, it } from 'vitest'
import { parseArgs } from '../args'
import { registerGit, runCommand } from '../run'
import { exec, text } from '../testing'
import { createWorld, writeFile } from '../world'

registerGit('stub', (ctx, argv) => {
  parseArgs(argv, { bool: ['v'] })
  ctx.w.files[ctx.w.cwd]['touched.txt'] = 'yes'
  ctx.out('stub ran')
  ctx.note('stub note')
})

describe('runCommand', () => {
  it('empty input is ok, prints nothing and returns the same world', () => {
    const w = createWorld()
    for (const line of ['', '   ', '\t']) {
      const r = runCommand(w, line)
      expect(r).toEqual({ world: w, output: [], note: null, effects: [], ok: true })
      expect(r.world).toBe(w)
    }
  })

  it('unknown commands are reported like a shell', () => {
    const w = createWorld()
    const r = runCommand(w, 'frobnicate --now')
    expect(r.ok).toBe(false)
    expect(r.output[0]).toEqual({ text: 'frobnicate: command not found', tone: 'err' })
    expect(r.world).toBe(w)
  })

  it('suggests the editor when someone types vim', () => {
    const r = runCommand(createWorld(), 'vim a.txt')
    expect(r.output[0].text).toBe('vim: command not found')
    expect(r.output.some((l) => l.tone === 'hint' && l.text.includes('edit'))).toBe(true)
  })

  it('real-but-unsupported git commands get a friendly message, not an error', () => {
    const r = runCommand(createWorld(), 'git bisect start')
    expect(text(r)).toContain("gitmatic doesn't simulate")
    expect(r.output.every((l) => l.tone !== 'err')).toBe(true)
  })

  it('unknown git subcommands match git', () => {
    const r = runCommand(createWorld(), 'git frob')
    expect(r.ok).toBe(false)
    expect(text(r)).toBe("git: 'frob' is not a git command. See 'git help'.")
  })

  it('does not mistake object prototype names for commands', () => {
    expect(runCommand(createWorld(), 'constructor').output[0].text).toBe(
      'constructor: command not found',
    )
    expect(text(runCommand(createWorld(), 'git toString'))).toBe(
      "git: 'toString' is not a git command. See 'git help'.",
    )
  })

  it('git alone prints a short usage pointing at git help', () => {
    const r = runCommand(createWorld(), 'git')
    expect(text(r)).toMatch(/^usage: git/)
    expect(text(r)).toContain('git help')
  })

  it('git --version prints a version', () => {
    expect(text(runCommand(createWorld(), 'git --version'))).toMatch(/^git version /)
  })

  it('unknown options to a git command fail and leave the world untouched', () => {
    const w = createWorld()
    const r = runCommand(w, 'git stub --bogus')
    expect(r.ok).toBe(false)
    expect(r.output).toEqual([{ text: "error: unknown option '--bogus'", tone: 'err' }])
    expect(r.note).toBeNull()
    expect(r.world).toBe(w)
  })

  it('registered git commands run against a draft and can output, note and change state', () => {
    const w = createWorld()
    const r = runCommand(w, 'git stub -v')
    expect(r.ok).toBe(true)
    expect(r.output).toEqual([{ text: 'stub ran', tone: 'out' }])
    expect(r.note).toBe('stub note')
    expect(r.world.files['/project']['touched.txt']).toBe('yes')
    expect(w.files['/project']).toEqual({})
  })

  it('increments the clock once per successful command only', () => {
    const w = createWorld()
    const ok = runCommand(w, 'touch a.txt')
    expect(ok.world.clock).toBe(1)
    const failed = runCommand(ok.world, 'cat nope.txt')
    expect(failed.world).toBe(ok.world)
    expect(failed.world.clock).toBe(1)
  })

  it('reports an unterminated quote without crashing', () => {
    const w = createWorld()
    const r = runCommand(w, 'git commit -m "oops')
    expect(r.ok).toBe(false)
    expect(r.output[0].tone).toBe('err')
    expect(r.world).toBe(w)
  })

  it('ignores a pasted leading "$ " prompt', () => {
    expect(text(runCommand(createWorld(), '$ pwd'))).toBe('/project')
  })

  it('redirects the output of any command into a file', () => {
    const w = writeFile(createWorld(), 'a.txt', 'x\ny\n')
    const { world } = exec(['cat a.txt > b.txt'], w)
    expect(world.files['/project']['b.txt']).toBe('x\ny\n')
  })

  it('never throws on awkward input', () => {
    const w = createWorld()
    for (const line of ['git ""', "''", '>', '>> >>', 'git -', 'git --', '""', 'echo \\']) {
      expect(() => runCommand(w, line), line).not.toThrow()
    }
  })
})
