import { GitError } from './errors'

export type Token = { type: 'word'; value: string } | { type: 'redirect'; append: boolean }

const UNSUPPORTED = new Set(['|', ';', '&', '<'])

/** Shell-like split: whitespace, '…' and "…" quotes, backslash escapes, `>` and `>>`. */
export function tokenize(line: string): Token[] {
  const tokens: Token[] = []
  let word = ''
  let inWord = false
  const flush = () => {
    if (inWord) tokens.push({ type: 'word', value: word })
    word = ''
    inWord = false
  }

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === ' ' || c === '\t' || c === '\n') {
      flush()
    } else if (c === "'") {
      const end = line.indexOf("'", i + 1)
      if (end === -1) throw unterminated("'")
      word += line.slice(i + 1, end)
      inWord = true
      i = end
    } else if (c === '"') {
      inWord = true
      let closed = false
      for (i++; i < line.length; i++) {
        const q = line[i]
        if (q === '"') {
          closed = true
          break
        }
        if (q === '\\' && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) {
          word += line[++i]
        } else {
          word += q
        }
      }
      if (!closed) throw unterminated('"')
    } else if (c === '\\') {
      if (i + 1 < line.length) word += line[++i]
      inWord = true
    } else if (c === '>') {
      flush()
      const append = line[i + 1] === '>'
      if (append) i++
      tokens.push({ type: 'redirect', append })
    } else if (UNSUPPORTED.has(c)) {
      throw new GitError(`gitmatic: '${c}' isn't supported here`, [
        'This terminal runs one simple command at a time: no pipes (|), chaining (; &&) or < input.',
      ])
    } else {
      word += c
      inWord = true
    }
  }
  flush()
  return tokens
}

function unterminated(quote: string): GitError {
  return new GitError(`unexpected end of line while looking for matching ${quote}`, [
    `Close the quote: every ${quote} needs a partner.`,
  ])
}
