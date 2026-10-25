import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { HowDoIPanel } from './HowDoIPanel'
import { HOW_DO_I } from '../../content/howdoi'
import { useTerminalInput } from '../../store/terminalInput'

describe('HowDoIPanel', () => {
  beforeEach(() => {
    // The terminal input is a module singleton; start each test empty.
    useTerminalInput.getState().setValue('')
  })

  it('shows all 12 questions with an empty search', () => {
    render(<HowDoIPanel />)
    for (const h of HOW_DO_I) {
      expect(screen.getByText(h.question)).toBeInTheDocument()
    }
  })

  it('filters on the query (undo) and excludes unrelated entries', async () => {
    const user = userEvent.setup()
    render(<HowDoIPanel />)
    const undo = HOW_DO_I.find((h) => h.id === 'undo-last-commit')!
    await user.type(screen.getByRole('searchbox'), 'undo')

    // At least one undo-related entry remains…
    const hits = screen.getAllByText(/undo/i)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    // …and the undo entry itself is there.
    expect(screen.getByText(undo.question)).toBeInTheDocument()
    // …while an unrelated entry (rename a branch) is gone.
    expect(screen.queryByText(/rename a branch/i)).not.toBeInTheDocument()
  })

  it('shows "No matches for …" when nothing matches', async () => {
    const user = userEvent.setup()
    render(<HowDoIPanel />)
    await user.type(screen.getByRole('searchbox'), 'zzz-not-a-command')
    expect(screen.getByText(/No matches for "zzz-not-a-command"/i)).toBeInTheDocument()
  })

  it('"Try it" fills the terminal input with the command (without running it)', async () => {
    const user = userEvent.setup()
    render(<HowDoIPanel />)
    const entry = HOW_DO_I.find((h) => h.id === 'see-what-changed')!
    await user.click(
      screen.getByText(entry.question).closest('.howdoi-item')!.querySelector('.howdoi-try')!,
    )

    expect(useTerminalInput.getState().value).toBe(entry.commands[0])
  })
})
