/**
 * Thrown by commands to abort. runCommand discards all changes, prints `lines`
 * as errors and `hints` as hints.
 */
export class GitError extends Error {
  lines: string[]
  hints: string[]

  constructor(lines: string | string[], hints: string[] = []) {
    const all = typeof lines === 'string' ? [lines] : lines
    super(all.join('\n'))
    this.name = 'GitError'
    this.lines = all
    this.hints = hints
  }
}
