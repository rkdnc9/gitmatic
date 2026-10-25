import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import type { KeyboardEvent } from 'react'
import { getCompletions, currentWorktree } from '../../engine'
import type { World } from '../../engine'
import { useSandbox } from '../../store/sandbox'
import type { TermLine } from '../../store/sandbox'
import { registerInput, useTerminalInput } from '../../store/terminalInput'
import { SuggestionChips } from './SuggestionChips'

/**
 * The git-prompt branch label, derived from the current worktree's HEAD and
 * pending operation: `(branch)`, `(branch|MERGING)` while a merge is in
 * progress, or `(HEAD detached)` off a branch.
 */
function promptLabel(world: World): string {
  const wt = currentWorktree(world)
  if (!wt) return '(none)'
  if (wt.head.type === 'detached') return '(HEAD detached)'
  if (wt.pending) return `(${wt.head.name}|MERGING)`
  return `(${wt.head.name})`
}

/**
 * The sandbox terminal: a scrollable transcript of `TermLine`s plus a live
 * input line. The input is backed by the `useTerminalInput` slice so outside
 * UI (GTM-14's "How do I…?" hints) can fill it; Enter runs the line through
 * `useSandbox.run`.
 *
 * Keys: Enter runs; Up/Down walk the command history; Tab completes (a single
 * candidate fills the input, several are shown as a hint, none is a no-op);
 * Ctrl+L clears the transcript the same way the `clear` command does.
 */
export function Terminal(): JSX.Element {
  const world = useSandbox((s) => s.world)
  const lines = useSandbox((s) => s.lines)
  const history = useSandbox((s) => s.history)
  const value = useTerminalInput((s) => s.value)
  const setValue = useTerminalInput((s) => s.setValue)
  const focus = useTerminalInput((s) => s.focus)

  const scrollerRef = useRef<HTMLDivElement>(null)
  /** Walks history while the arrows are held; null = not in the history. */
  const histRef = useRef<number | null>(null)

  const label = promptLabel(world)

  // Auto-scroll to the newest line whenever the transcript grows.
  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  function runLine(): void {
    const line = useTerminalInput.getState().value.trim()
    if (line === '') return
    histRef.current = null
    useSandbox.getState().run(line)
    useTerminalInput.getState().setValue('')
  }

  function complete(): void {
    const line = useTerminalInput.getState().value
    const cands = getCompletions(useSandbox.getState().world, line)
    if (cands.length === 1) {
      const start = line.lastIndexOf(' ') + 1
      // Leave a trailing space (except after a flag) so the next token can be typed.
      const sep = cands[0].startsWith('-') ? '' : ' '
      setValue(line.slice(0, start) + cands[0] + sep)
    } else if (cands.length > 1) {
      useSandbox.getState().pushLine('hint', cands.join('  '))
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      runLine()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      complete()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length === 0) return
      const idx = histRef.current === null ? history.length - 1 : Math.max(0, histRef.current - 1)
      histRef.current = idx
      setValue(history[idx])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (histRef.current === null) return
      const idx = histRef.current + 1
      if (idx >= history.length) {
        histRef.current = null
        setValue('')
      } else {
        histRef.current = idx
        setValue(history[idx])
      }
    } else if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault()
      histRef.current = null
      useSandbox.getState().run('clear')
    }
  }

  function renderLine(l: TermLine): JSX.Element {
    if (l.kind === 'input') {
      return (
        <div key={l.id} className="tl tl-input">
          <span className="prompt">
            <span className="dollar">$</span> <span className="branch">{label}</span>{' '}
          </span>
          <span className="cmd">{l.text}</span>
        </div>
      )
    }
    return (
      <div key={l.id} className={`tl tl-${l.kind}`}>
        {l.text}
      </div>
    )
  }

  return (
    <section className="terminal" onClick={focus} data-testid="terminal">
      <style>{TERMINAL_CSS}</style>
      <div ref={scrollerRef} className="scroller" aria-label="Terminal transcript">
        {lines.map(renderLine)}
      </div>
      <div className="input-row">
        <span className="prompt">
          <span className="dollar">$</span> <span className="branch" data-testid="prompt-branch">{label}</span>{' '}
        </span>
        <input
          ref={registerInput}
          className="cmd-input"
          value={value}
          placeholder="type a command"
          aria-label="Terminal input"
          onChange={(e) => {
            setValue(e.target.value)
            histRef.current = null
          }}
          onKeyDown={onKey}
          autoFocus
        />
      </div>
      <SuggestionChips onPick={(cmd) => setValue(cmd)} />
    </section>
  )
}

const TERMINAL_CSS = `
.terminal {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 52rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.95rem;
  background: var(--bg, #0d1117);
  color: var(--fg, #e6edf3);
  border: 1px solid var(--border, #30363d);
  border-radius: 0.5rem;
  padding: 0.75rem;
  cursor: text;
}
.terminal .scroller {
  max-height: 60vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.terminal .tl {
  white-space: pre-wrap;
  word-break: break-word;
}
.terminal .tl .prompt {
  user-select: none;
}
.terminal .dollar {
  color: var(--accent, #58a6ff);
  font-weight: 700;
}
.terminal .branch {
  color: var(--accent, #58a6ff);
  font-weight: 700;
}
.terminal .tl-out {
  color: inherit;
}
.terminal .tl-err {
  color: var(--err, #f85149);
}
.terminal .tl-ok {
  color: var(--ok, #3fb950);
}
.terminal .tl-hint,
.terminal .tl-note {
  color: var(--muted, #8b949e);
}
.terminal .tl-note {
  font-style: italic;
}
.terminal .input-row {
  display: flex;
  align-items: baseline;
}
.terminal .cmd-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: inherit;
  font: inherit;
  padding: 0;
}
.terminal .chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.terminal .chip {
  font: inherit;
  font-size: 0.8rem;
  color: var(--fg, #e6edf3);
  background: var(--chip-bg, #21262d);
  border: 1px solid var(--border, #30363d);
  border-radius: 0.35rem;
  padding: 0.2rem 0.55rem;
  cursor: pointer;
}
.terminal .chip:hover {
  border-color: var(--accent, #58a6ff);
}
`
