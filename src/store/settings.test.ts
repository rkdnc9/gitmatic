import { beforeEach, describe, expect, it, vi } from 'vitest'

const SETTINGS_KEY = 'gitmatic:settings'

type SettingsModule = typeof import('./settings')

// Same module-loading boundary as sandbox.test.ts: the store is a singleton
// that hydrates once at creation, so tests re-instantiate it.
async function loadSettings(): Promise<SettingsModule> {
  vi.resetModules()
  const mod = await import('./settings')
  await new Promise<void>((resolve) => {
    if (mod.useSettings.persist.hasHydrated()) resolve()
    else mod.useSettings.persist.onFinishHydration(() => resolve())
  })
  return mod
}

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts at the documented defaults', async () => {
    const { useSettings } = await loadSettings()
    const s = useSettings.getState()
    expect(s.reduceMotion).toBe(false)
    expect(s.theme).toBe('dark')
  })

  it('setTheme persists to gitmatic:settings', async () => {
    const { useSettings } = await loadSettings()
    useSettings.getState().setTheme('light')
    expect(useSettings.getState().theme).toBe('light')
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!)
    expect(stored.version).toBe(1)
    expect(stored.state.theme).toBe('light')
  })

  it('setReduceMotion persists to gitmatic:settings', async () => {
    const { useSettings } = await loadSettings()
    useSettings.getState().setReduceMotion(true)
    expect(useSettings.getState().reduceMotion).toBe(true)
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!)
    expect(stored.state.reduceMotion).toBe(true)
    expect(stored.state.theme).toBe('dark')
  })

  it('rehydrates stored settings and ignores corrupt values', async () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, state: { reduceMotion: true, theme: 'light' } }),
    )
    const { useSettings } = await loadSettings()
    expect(useSettings.getState().reduceMotion).toBe(true)
    expect(useSettings.getState().theme).toBe('light')

    localStorage.clear()
    localStorage.setItem(SETTINGS_KEY, '{not json')
    const fresh = await loadSettings()
    expect(fresh.useSettings.getState().theme).toBe('dark')
  })
})
