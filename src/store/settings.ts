import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { safeStorage } from './storage'

export interface SettingsState {
  reduceMotion: boolean
  theme: 'dark' | 'light'
  setReduceMotion(v: boolean): void
  setTheme(t: 'dark' | 'light'): void
}

/** UI preferences. Persisted separately from the sandbox so a scenario reset never loses them. */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      reduceMotion: false,
      theme: 'dark',
      setReduceMotion(v) {
        set({ reduceMotion: v })
      },
      setTheme(t) {
        set({ theme: t })
      },
    }),
    {
      name: 'gitmatic:settings',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      migrate: () => ({ reduceMotion: false, theme: 'dark' }),
    },
  ),
)
