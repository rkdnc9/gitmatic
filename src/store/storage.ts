import type { StateStorage } from 'zustand/middleware'

/**
 * localStorage-backed StateStorage for zustand's persist middleware.
 *
 * `getItem` returns null when the key is missing, the value is not a string,
 * or it is not valid JSON — so persist sees "nothing stored" instead of
 * crashing the app on a corrupted entry. `setItem`/`removeItem` are no-op
 * when localStorage itself is unavailable (private mode, blocked).
 */
export const safeStorage: StateStorage = {
  getItem(name) {
    try {
      const raw = window.localStorage.getItem(name)
      if (raw === null) return null
      JSON.parse(raw)
      return raw
    } catch {
      return null
    }
  },
  setItem(name, value) {
    try {
      window.localStorage.setItem(name, value)
    } catch {
      // Storage unavailable or full: persistence is a nice-to-have, never fatal.
    }
  },
  removeItem(name) {
    try {
      window.localStorage.removeItem(name)
    } catch {
      // Same as above.
    }
  },
}
