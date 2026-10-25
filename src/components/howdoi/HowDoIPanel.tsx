import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { HOW_DO_I } from '../../content/howdoi'
import type { HowDoI } from '../../content/howdoi'
import { useTerminalInput } from '../../store/terminalInput'

/** Case-insensitive substring match over the question and every keyword. */
function matches(h: HowDoI, q: string): boolean {
  if (q === '') return true
  const needle = q.toLowerCase()
  if (h.question.toLowerCase().includes(needle)) return true
  return h.keywords.some((k) => k.toLowerCase().includes(needle))
}

/**
 * The "How do I…?" side panel: a search field over the hint library plus a
 * scrollable list of matches. Each row shows the question, a one-line
 * explanation, the concrete command as a code chip, and a "Try it" button
 * that fills (and focuses) the terminal input without running it.
 */
export function HowDoIPanel(): JSX.Element {
  const [query, setQuery] = useState('')
  const hits = useMemo(() => HOW_DO_I.filter((h) => matches(h, query)), [query])

  return (
    <div className="howdoi" data-testid="howdoi">
      <input
        type="search"
        className="howdoi-search"
        placeholder="search, e.g. undo, stash, rename…"
        aria-label="Search how-to hints"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="howdoi-list" role="list" aria-label="How-to hints">
        {hits.map((h) => (
          <li key={h.id} className="howdoi-item">
            <p className="howdoi-question">{h.question}</p>
            <p className="howdoi-why">{h.why}</p>
            <div className="howdoi-row">
              <code className="howdoi-cmd">{h.commands[0]}</code>
              <button
                type="button"
                className="howdoi-try"
                onClick={() => useTerminalInput.getState().focusTerminalWithText(h.commands[0])}
              >
                Try it
              </button>
            </div>
          </li>
        ))}
      </ul>
      {hits.length === 0 && <p className="howdoi-empty">No matches for "{query}"</p>}
    </div>
  )
}
