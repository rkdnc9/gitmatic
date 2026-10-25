import type { JSX } from 'react'
import { suggestCommands } from '../../content/suggestions'
import { useSandbox } from '../../store/sandbox'

/**
 * "Next command" chips derived from the world. Each chip fills the terminal
 * input (via `onPick`) rather than running, so the user can edit before
 * executing. `onPick` is wired by the Terminal to the input's value setter.
 */
export function SuggestionChips({ onPick }: { onPick(cmd: string): void }): JSX.Element {
  const world = useSandbox((s) => s.world)
  const chips = suggestCommands(world)
  if (chips.length === 0) return <div className="chips" aria-hidden="true" />

  return (
    <div className="chips" role="toolbar" aria-label="Suggested commands">
      {chips.map((cmd) => (
        <button
          key={cmd}
          type="button"
          className="chip"
          onClick={() => onPick(cmd)}
        >
          {cmd}
        </button>
      ))}
    </div>
  )
}
