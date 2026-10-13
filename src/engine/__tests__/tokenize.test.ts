import { describe, expect, it } from 'vitest'
import { GitError } from '../errors'
import { tokenize, type Token } from '../tokenize'

const words = (tokens: Token[]) => tokens.map((t) => (t.type === 'word' ? t.value : '>'))

describe('tokenize', () => {
  it('splits words and keeps double-quoted text together', () => {
    expect(words(tokenize('git commit -m "first save"'))).toEqual([
      'git',
      'commit',
      '-m',
      'first save',
    ])
  })

  it('handles single quotes and an append redirect', () => {
    expect(tokenize("echo 'hi there' >> notes.txt")).toEqual([
      { type: 'word', value: 'echo' },
      { type: 'word', value: 'hi there' },
      { type: 'redirect', append: true },
      { type: 'word', value: 'notes.txt' },
    ])
  })

  it('returns no tokens for blank input', () => {
    expect(tokenize('  ')).toEqual([])
    expect(tokenize('')).toEqual([])
  })

  it('throws GitError on an unterminated quote', () => {
    expect(() => tokenize('echo "oops')).toThrow(GitError)
    expect(() => tokenize("echo 'oops")).toThrow(GitError)
  })

  it('collapses extra spaces and tabs', () => {
    expect(words(tokenize('  git   status\t '))).toEqual(['git', 'status'])
  })

  it('recognises redirects without surrounding spaces', () => {
    expect(tokenize('echo hi>a.txt')).toEqual([
      { type: 'word', value: 'echo' },
      { type: 'word', value: 'hi' },
      { type: 'redirect', append: false },
      { type: 'word', value: 'a.txt' },
    ])
  })

  it('treats quoted > as text', () => {
    expect(words(tokenize('echo "a > b"'))).toEqual(['echo', 'a > b'])
  })

  it('joins adjacent quoted and unquoted parts into one word', () => {
    expect(words(tokenize('echo "a"b\'c\''))).toEqual(['echo', 'abc'])
  })

  it('keeps empty quotes as an empty word', () => {
    expect(words(tokenize('git commit -m ""'))).toEqual(['git', 'commit', '-m', ''])
  })

  it('supports backslash escapes', () => {
    expect(words(tokenize('echo "say \\"hi\\"" a\\ b'))).toEqual(['echo', 'say "hi"', 'a b'])
  })

  it('refuses pipes and command chaining with a GitError', () => {
    expect(() => tokenize('git log | less')).toThrow(GitError)
    expect(() => tokenize('git add . && git commit')).toThrow(GitError)
    expect(() => tokenize('ls; pwd')).toThrow(GitError)
    expect(words(tokenize('git commit -m "a; b | c"'))).toEqual(['git', 'commit', '-m', 'a; b | c'])
  })
})
