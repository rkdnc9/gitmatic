import { Decoration, EditorView } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

/** A line that is (or contains) a merge-conflict marker line. */
export const CONFLICT_LINE = /^\s*(<{7}|={7}|>{7})/

/** The 1-based line numbers in `content` that carry a conflict marker. */
export function conflictLines(content: string): number[] {
  const out: number[] = []
  content.split('\n').forEach((l, i) => {
    if (CONFLICT_LINE.test(l)) out.push(i + 1)
  })
  return out
}

/** CodeMirror extension: highlight conflict-marker lines with a red-tinted background. */
export const conflictHighlight = EditorView.decorations.of((view) => {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  for (let i = 0; i < doc.lines; i++) {
    const line = doc.line(i + 1)
    if (CONFLICT_LINE.test(line.text)) builder.add(line.from, line.to, Decoration.line({ class: 'gm-conflict-line' }))
  }
  return builder.finish()
})