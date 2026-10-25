import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsScreen from '../screens/SettingsScreen'
import { useSettings } from '../store/settings'

const mount = () =>
  render(
    <MemoryRouter>
      <SettingsScreen />
    </MemoryRouter>,
  )

describe('SettingsScreen', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useSettings.getState().setTheme('dark')
    useSettings.getState().setReduceMotion(false)
  })

  it('toggling reduce motion persists to gitmatic:settings', async () => {
    const user = userEvent.setup()
    mount()
    const rm = screen.getByRole('switch', { name: /reduce motion/i })
    await user.click(rm)
    expect(useSettings.getState().reduceMotion).toBe(true)
    const stored = JSON.parse(window.localStorage.getItem('gitmatic:settings') ?? '{}')
    expect(stored.state.reduceMotion).toBe(true)
  })

  it('toggling theme persists', async () => {
    const user = userEvent.setup()
    mount()
    const theme = screen.getByRole('switch', { name: /light theme/i })
    await user.click(theme)
    expect(useSettings.getState().theme).toBe('light')
    const stored = JSON.parse(window.localStorage.getItem('gitmatic:settings') ?? '{}')
    expect(stored.state.theme).toBe('light')
  })

  it('Reset everything returns settings to defaults', async () => {
    const user = userEvent.setup()
    // Put the stores in a non-default state first.
    useSettings.getState().setTheme('light')
    useSettings.getState().setReduceMotion(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mount()
    await user.click(screen.getByRole('button', { name: /reset everything/i }))
    expect(useSettings.getState().theme).toBe('dark')
    expect(useSettings.getState().reduceMotion).toBe(false)
    const stored = JSON.parse(window.localStorage.getItem('gitmatic:settings') ?? '{}')
    expect(stored.state).toMatchObject({ theme: 'dark', reduceMotion: false })
  })

  it('Reset sandbox is guarded by confirm', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount()
    await user.click(screen.getByRole('button', { name: /reset sandbox/i }))
    expect(confirmSpy).toHaveBeenCalled()
  })
})