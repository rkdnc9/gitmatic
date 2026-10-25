import { structuredPatch } from 'diff'
import type { OutputLine } from './types'

/**
 * Renders the unified diff of `path` between `before` and `after` as output
 * lines. Either side may be null (new file or deletion); null renders as
 * /dev/null in the `---`/`+++` headers. Hunk content lines get git's tones:
 * `+` lines 'ok', `-` lines 'err', context and headers 'out'.
 */
export function unifiedDiff(
  path: string,
  before: string | null,
  after: string | null,
): OutputLine[] {
  const patch = structuredPatch(`a/${path}`, `b/${path}`, before ?? '', after ?? '')
  const lines: OutputLine[] = [
    { text: `diff --git a/${path} b/${path}`, tone: 'out' },
    { text: before === null ? '--- /dev/null' : `--- a/${path}`, tone: 'out' },
    { text: after === null ? '+++ /dev/null' : `+++ b/${path}`, tone: 'out' },
  ]
  for (const hunk of patch.hunks) {
    lines.push({
      text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      tone: 'out',
    })
    for (const line of hunk.lines) {
      const tone: OutputLine['tone'] = line.startsWith('+') ? 'ok' : line.startsWith('-') ? 'err' : 'out'
      lines.push({ text: line, tone })
    }
  }
  return lines
}