import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The `useSandbox` store is a module-level singleton (persist hydrates once at
 * creation), so each test re-instantiates the whole Terminal module graph after
 * clearing localStorage and `vi.resetModules()`. The dynamic imports below are
 * the intentional module-loading boundary (a static import would keep the stale
 * singleton); the `await` lets persist rehydrate (async in zustand) before the
 * test acts.
 */
async function loadTerminal() {
  localStorage.clear()
  vi.resetModules()
  const mod = await import('./Terminal')
  const sbox = await import('../../store/sandbox')
  await new Promise<void>((resolve) => {
    if (sbox.useSandbox.persist.hasHydrated()) resolve()
    else sbox.useSandbox.persist.onFinishHydration(() => resolve())
  })
  return { Terminal: mod.Terminal, useSandbox: sbox.useSandbox }
}

const input = () => screen.getByRole('textbox', { name: /terminal input/i })

async function initRepo(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(input(), 'git init')
  await user.keyboard('{Enter}')
  // `git init` prints its message twice (ok output + note), so use the array form.
  const lines = await screen.findAllByText(/Initialized empty Git repository/i)
  expect(lines.length).toBeGreaterThanOrEqual(1)
}

describe('Terminal', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('runs a command on Enter, shows the output, and clears the input', async () => {
    const { Terminal, useSandbox } = await loadTerminal()
    render(<Terminal />)
    const user = userEvent.setup()
    await initRepo(user)
    expect(input()).toHaveValue('')
    expect(useSandbox.getState().world.repo).not.toBeNull()
  })

  it('recalls the last command with the up arrow', async () => {
    const { Terminal } = await loadTerminal()
    render(<Terminal />)
    const user = userEvent.setup()
    await initRepo(user)
    await user.keyboard('{ArrowUp}')
    expect(input()).toHaveValue('git init')
  })

  it('completes a single candidate on Tab (git sw -> git switch )', async () => {
    const { Terminal } = await loadTerminal()
    render(<Terminal />)
    const user = userEvent.setup()
    await initRepo(user)
    await user.type(input(), 'git sw')
    await user.keyboard('{Tab}')
    expect(input()).toHaveValue('git switch ')
  })

  it('prints a hint line when Tab has multiple candidates', async () => {
    const { Terminal } = await loadTerminal()
    render(<Terminal />)
    const user = userEvent.setup()
    await initRepo(user)
    // `git ` with an empty subcommand matches every git subcommand.
    await user.type(input(), 'git ')
    await user.keyboard('{Tab}')
    // Several candidates: the input is left unchanged and a hint is shown.
    expect(input()).toHaveValue('git ')
    expect(screen.getAllByText(/branch/i).length).toBeGreaterThanOrEqual(1)
  })

  it('leaves the input alone when Tab has no candidates', async () => {
    const { Terminal } = await loadTerminal()
    render(<Terminal />)
    const user = userEvent.setup()
    await initRepo(user)
    await user.type(input(), 'zzz')
    await user.keyboard('{Tab}')
    expect(input()).toHaveValue('zzz')
  })

  it('fills the input from a suggestion chip without running it', async () => {
    const { Terminal, useSandbox } = await loadTerminal()
    render(<Terminal />)
    const user = userEvent.setup()
    expect(useSandbox.getState().world.repo).toBeNull()
    await user.click(screen.getByRole('button', { name: 'git init' }))
    // The chip filled the input; nothing was executed.
    expect(input()).toHaveValue('git init')
    expect(useSandbox.getState().world.repo).toBeNull()
    expect(screen.queryAllByText(/Initialized empty Git repository/i)).toHaveLength(0)
  })

  it('shows (main|MERGING) in the prompt after a conflicted merge', async () => {
    const { Terminal, useSandbox } = await loadTerminal()
    render(<Terminal />)
    useSandbox.getState().reset('conflict-waiting')
    useSandbox.getState().run('git merge feature')
    await screen.findAllByText(/Automatic merge failed/i)
    expect(screen.getByTestId('prompt-branch')).toHaveTextContent('(main|MERGING)')
  })

  it('clears the transcript with Ctrl+L', async () => {
    const { Terminal } = await loadTerminal()
    render(<Terminal />)
    const user = userEvent.setup()
    await initRepo(user)
    await user.keyboard('{Control>}l')
    expect(screen.queryAllByText(/Initialized empty Git repository/i)).toHaveLength(0)
  })

  it('focuses the input when the terminal body is clicked', async () => {
    const { Terminal } = await loadTerminal()
    render(<Terminal />)
    const user = userEvent.setup()
    await user.click(document.body)
    expect(input()).not.toHaveFocus()
    await user.click(screen.getByTestId('terminal'))
    expect(input()).toHaveFocus()
  })
})
