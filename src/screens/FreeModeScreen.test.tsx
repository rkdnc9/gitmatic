import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * FreeModeScreen pulls in the whole sandbox (terminal, graph, files, store
 * persistence), so this smoke test is intentionally light: it asserts the
 * major zones render (graph panel + terminal) and that the header controls
 * are present. No interaction here — the component-level behaviour is
 * covered by the panel tests.
 */
async function loadScreen() {
  localStorage.clear()
  vi.resetModules()
  const mod = await import('./FreeModeScreen')
  const sbox = await import('../store/sandbox')
  await new Promise<void>((resolve) => {
    if (sbox.useSandbox.persist.hasHydrated()) resolve()
    else sbox.useSandbox.persist.onFinishHydration(() => resolve())
  })
  return { FreeModeScreen: mod.default, useSandbox: sbox.useSandbox }
}

describe('FreeModeScreen', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the commit graph panel, the terminal, and the header controls', async () => {
    const { FreeModeScreen: Screen } = await loadScreen()
    render(
      <MemoryRouter>
        <Screen />
      </MemoryRouter>,
    )

    expect(screen.getByText('gitmatic')).toBeInTheDocument()
    expect(screen.getByText('Free mode')).toBeInTheDocument()
    expect(screen.getByText('Commit graph')).toBeInTheDocument()
    expect(screen.getByTestId('terminal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    // The default tab is "How do I…?"; its search box is visible.
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    // The Files tab is present but not active.
    expect(screen.getByRole('tab', { name: 'Files' })).toBeInTheDocument()
  })
})
