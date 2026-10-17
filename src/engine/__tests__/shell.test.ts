import { describe, expect, it } from 'vitest'
import { exec, text } from '../testing'
import { produce } from 'immer'
import { createWorld, workdir } from '../world'

describe('shell commands', () => {
  it('echo > writes a file and cat prints it', () => {
    const { world, last } = exec(['echo "hello" > a.txt', 'cat a.txt'])
    expect(workdir(world)['a.txt']).toBe('hello\n')
    expect(last.ok).toBe(true)
    expect(text(last)).toBe('hello')
  })

  it('echo without a redirect prints its arguments', () => {
    const { last } = exec(['echo hello   there "  friend"'])
    expect(last.output).toEqual([{ text: 'hello there   friend', tone: 'out' }])
  })

  it('echo > overwrites and >> appends a line', () => {
    const { world } = exec(['echo "one" > a.txt', 'echo "two" > a.txt', 'echo "more" >> a.txt'])
    expect(workdir(world)['a.txt']).toBe('two\nmore\n')
  })

  it('>> creates a missing file', () => {
    const { world } = exec(['echo "x" >> new.txt'])
    expect(workdir(world)['new.txt']).toBe('x\n')
  })

  it('a redirect captures output instead of printing it', () => {
    const { last } = exec(['echo "hi" > a.txt'])
    expect(last.output).toEqual([])
  })

  it('a redirect with no target is a syntax error', () => {
    const { last } = exec(['echo hi >'])
    expect(last.ok).toBe(false)
    expect(text(last)).toMatch(/syntax error/)
  })

  it('touch creates an empty file and leaves existing files alone', () => {
    const { world } = exec(['echo "keep" > a.txt', 'touch b.txt', 'touch a.txt'])
    expect(workdir(world)['b.txt']).toBe('')
    expect(workdir(world)['a.txt']).toBe('keep\n')
  })

  it('ls lists files sorted, separated by two spaces', () => {
    const { last } = exec(['touch b.txt', 'echo "hello" > a.txt', 'ls'])
    expect(text(last)).toBe('a.txt  b.txt')
  })

  it('ls on an empty directory prints nothing', () => {
    const { last } = exec(['ls'])
    expect(last.ok).toBe(true)
    expect(last.output).toEqual([])
  })

  it('rm removes a file; cat then reports it missing', () => {
    const { world, last } = exec(['touch a.txt', 'rm a.txt', 'cat a.txt'])
    expect(workdir(world)['a.txt']).toBeUndefined()
    expect(last.ok).toBe(false)
    expect(last.output).toEqual([{ text: 'cat: a.txt: No such file or directory', tone: 'err' }])
  })

  it('rm of a missing file is refused, rm -f is quiet', () => {
    expect(text(exec(['rm nope.txt']).last)).toBe(
      "rm: cannot remove 'nope.txt': No such file or directory",
    )
    expect(exec(['rm -f nope.txt']).last.ok).toBe(true)
  })

  it('pwd prints /project', () => {
    expect(text(exec(['pwd']).last)).toBe('/project')
  })

  it('clear emits a clear effect', () => {
    expect(exec(['clear']).last.effects).toEqual([{ type: 'clear' }])
  })

  it('edit emits open-editor and creates the file if absent', () => {
    const { world, last } = exec(['edit a.txt'])
    expect(last.effects).toEqual([{ type: 'open-editor', path: 'a.txt' }])
    expect(workdir(world)['a.txt']).toBe('')
  })

  it('edit keeps existing content', () => {
    const { world } = exec(['echo "x" > a.txt', 'edit a.txt'])
    expect(workdir(world)['a.txt']).toBe('x\n')
  })

  it('accepts ./ prefixed paths', () => {
    const { world, last } = exec(['echo "hi" > ./a.txt', 'cat ./a.txt'])
    expect(Object.keys(workdir(world))).toEqual(['a.txt'])
    expect(text(last)).toBe('hi')
  })

  it('refuses paths in subdirectories (toy repos are flat)', () => {
    const { world, last } = exec(['touch src/a.txt'])
    expect(last.ok).toBe(false)
    expect(workdir(world)).toEqual({})
  })

  it('cat prints multi-line files line by line', () => {
    const { last } = exec(['echo "a" > f.txt', 'echo "b" >> f.txt', 'cat f.txt'])
    expect(last.output).toEqual([
      { text: 'a', tone: 'out' },
      { text: 'b', tone: 'out' },
    ])
  })

  it('commands without required operands explain themselves', () => {
    for (const cmd of ['cat', 'touch', 'rm', 'edit']) {
      const { last } = exec([cmd])
      expect(last.ok, cmd).toBe(false)
      expect(text(last), cmd).toMatch(cmd)
    }
  })

  it('treats names like constructor and toString as ordinary files', () => {
    expect(text(exec(['cat constructor']).last)).toBe('cat: constructor: No such file or directory')
    const { world, last } = exec(['touch constructor', 'echo "x" >> toString', 'ls'])
    expect(text(last)).toBe('constructor  toString')
    expect(workdir(world)['toString']).toBe('x\n')
  })

  it('rm -rf .git removes the repository but keeps files', () => {
    const w = produce(createWorld(), (d) => {
      d.files['/project']['a.txt'] = 'a\n'
      d.repo = { root: '/project', commits: {}, branches: {}, tags: {}, stash: [], worktrees: {} }
    })
    expect(text(exec(['rm .git'], w).last)).toBe("rm: cannot remove '.git': Is a directory")
    const { world, last } = exec(['rm -rf .git'], w)
    expect(world.repo).toBeNull()
    expect(workdir(world)).toEqual({ 'a.txt': 'a\n' })
    expect(last.note).toMatch(/no longer a git repository/)
  })
})
