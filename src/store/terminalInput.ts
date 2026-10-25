import { create } from 'zustand'

/**
 * The Terminal's input-field state: a non-persisted slice so other UI (the
 * "How do I…?" hints in GTM-14) can fill the input without importing the
 * component. `value` is the current input text; `setValue` fills it; `focus`
 * moves the caret to the input; `focusTerminalWithText` does both. The
 * component registers its input element via `registerInput` so `focus` can
 * reach it (no persistence: a fresh load starts with an empty input).
 */
let inputEl: HTMLInputElement | null = null

export function registerInput(el: HTMLInputElement | null): void {
  inputEl = el
}

export interface TerminalInputState {
  value: string
  setValue(v: string): void
  focus(): void
  focusTerminalWithText(text: string): void
}

export const useTerminalInput = create<TerminalInputState>()((set, get) => ({
  value: '',
  setValue: (v) => set({ value: v }),
  focus: () => {
    if (inputEl && document.activeElement !== inputEl) inputEl.focus()
  },
  focusTerminalWithText: (text) => {
    set({ value: text })
    get().focus()
  },
}))
