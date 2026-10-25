import { describe, expect, it } from 'vitest'
import { exec, text } from '../testing'
import '../commands'

describe('git log', () => {
  it('fails on an unborn branch with the exact message', () => {
    const r = exec(['git init', 'git log'])
    expect(r.last.ok).toBe(false)
    expect(text(r.last)).toBe(
      "fatal: your current branch 'main' does not have any commits yet",
    )
  })

  it('prints the full format with author, date and indented message', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "first"',
      'echo "b" > b.txt',
      'git add b.txt',
      'git commit -m "second"',
      'git log',
    ])
    const t = text(r.last)
    const lines = t.split('\n')
    expect(lines[0]).toMatch(/^commit [0-9a-f]{7} \(HEAD -> main\)$/)
    expect(lines[1]).toBe('Author: You <you@gitmatic.dev>')
    expect(lines[2]).toMatch(/^Date: {3}.+$/)
    expect(lines[3]).toBe('')
    expect(lines[4]).toBe('    second')
    // newest first
    expect(t.indexOf('second')).toBeLessThan(t.indexOf('first'))
  })

  it('--oneline shows sha, decoration and message', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "first"',
      'git log --oneline',
    ])
    expect(text(r.last)).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) first$/)
  })

  it('--all includes branch tips', () => {
    const w = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
    ]).world
    // Add a feature branch pointing at the same commit.
    const w2 = { ...w, repo: { ...w.repo!, branches: { ...w.repo!.branches, feature: w.repo!.branches.main } } }
    const r = exec(['git log --all --oneline'], w2)
    expect(text(r.last)).toMatch(/^[0-9a-f]{7} \(HEAD -> main, feature\) c1$/)
  })

  it('--graph prefixes a * in oneline mode', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "c1"',
      'git log --graph --oneline',
    ])
    expect(text(r.last)).toMatch(/^\* [0-9a-f]{7} \(HEAD -> main\) c1$/)
  })

  it('orders commits by time descending', () => {
    const r = exec([
      'git init',
      'echo "a" > a.txt',
      'git add a.txt',
      'git commit -m "one"',
      'echo "b" > b.txt',
      'git add b.txt',
      'git commit -m "two"',
      'echo "c" > c.txt',
      'git add c.txt',
      'git commit -m "three"',
      'git log --oneline',
    ])
    const lines = text(r.last)
      .split('\n')
      .map((l) => l.replace(/^\* /, '').replace(/^[0-9a-f]{7}( \([^)]*\))? /, ''))
    expect(lines).toEqual(['three', 'two', 'one'])
  })
})
