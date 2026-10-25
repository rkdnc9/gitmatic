import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { runCommand, writeFile } from '../engine'
import type { World } from '../engine'
import { buildPreset } from '../content/presets'
import type { PresetId } from '../content/presets'
import { safeStorage } from './storage'

export interface TermLine {
  id: number
  kind: 'input' | 'out' | 'err' | 'hint' | 'ok' | 'note'
  text: string
}

export interface SandboxState {
  world: World
  lines: TermLine[]
  history: string[]
  presetId: PresetId
  editorPath: string | null
  run(line: string): void
  reset(presetId?: PresetId): void
  saveFile(path: string, content: string): void
  closeEditor(): void
  pushLine(kind: TermLine['kind'], text: string): void
}

const MAX_LINES = 500
const MAX_HISTORY = 100
const PRESET_IDS: PresetId[] = ['blank', 'fresh-project', 'feature-branch', 'conflict-waiting']

type Data = Pick<SandboxState, 'world' | 'lines' | 'history' | 'presetId' | 'editorPath'>

let nextId = 1
function termLine(kind: TermLine['kind'], text: string): TermLine {
  return { id: nextId++, kind, text }
}

/** Fresh state: a blank world, empty transcript and history. */
function initialState(): Data {
  return {
    world: buildPreset('blank'),
    lines: [],
    history: [],
    presetId: 'blank',
    editorPath: null,
  }
}

/**
 * Rehydrates persisted state. Any shape that is not a valid data object
 * (corrupt JSON, hand-edited values, ...) falls back to a fresh blank world
 * instead of crashing the store.
 */
function rehydratePersisted(persisted: unknown): Data {
  if (persisted && typeof persisted === 'object') {
    const p = persisted as Partial<Data>
    if (p.world && typeof p.world === 'object') {
      const lines = Array.isArray(p.lines) ? (p.lines as TermLine[]) : []
      nextId = lines.reduce((max, l) => Math.max(max, l.id), nextId) + 1
      return {
        world: p.world as World,
        lines,
        history: Array.isArray(p.history) ? (p.history as string[]) : [],
        presetId: PRESET_IDS.includes(p.presetId as PresetId) ? (p.presetId as PresetId) : 'blank',
        editorPath: typeof p.editorPath === 'string' || p.editorPath === null ? p.editorPath : null,
      }
    }
  }
  return initialState()
}

/**
 * The sandbox: the terminal's state, the git world it runs against, and the
 * editor overlay.
 *
 * Effect handling: `runCommand` returns an `effects` array and this store
 * interprets it directly — `{ type: 'clear' }` (the `clear` shell command)
 * empties the transcript, `{ type: 'open-editor', path }` (`edit <file>`)
 * sets `editorPath`. The Terminal component therefore only ever calls
 * `run(line)` and never branches on effects itself.
 */
export const useSandbox = create<SandboxState>()(
  persist(
    (set, get) => ({
      ...initialState(),

      run(line) {
        const { world, lines, history } = get()
        const r = runCommand(world, line)

        const next: TermLine[] = [...lines, termLine('input', line)]
        for (const o of r.output) next.push(termLine(o.tone, o.text))
        if (r.note !== null) next.push(termLine('note', r.note))

        const nextHistory =
          history[history.length - 1] === line ? history : [...history, line].slice(-MAX_HISTORY)

        let nextLines = next.slice(-MAX_LINES)
        let editorPath = get().editorPath
        for (const e of r.effects) {
          if (e.type === 'clear') nextLines = []
          else if (e.type === 'open-editor') editorPath = e.path
        }

        set({ world: r.world, lines: nextLines, history: nextHistory, editorPath })
      },

      reset(presetId) {
        const id = presetId ?? 'blank'
        set({ ...initialState(), presetId: id, world: buildPreset(id) })
      },

      saveFile(path, content) {
        set({ world: writeFile(get().world, path, content), editorPath: null })
      },

      closeEditor() {
        set({ editorPath: null })
      },

      pushLine(kind, text) {
        set({ lines: [...get().lines, termLine(kind, text)].slice(-MAX_LINES) })
      },
    }),
    {
      name: 'gitmatic:sandbox',
      version: 1,
      // createJSONStorage serialises/deserialises around safeStorage; safeStorage
      // itself returns null for missing or corrupt entries, so a bad value reads
      // as "nothing stored" instead of throwing.
      storage: createJSONStorage(() => safeStorage),
      migrate: () => initialState(),
      merge: (persisted, current) => ({ ...current, ...rehydratePersisted(persisted) }),
      partialize: (s): Data => ({
        world: s.world,
        lines: s.lines,
        history: s.history,
        presetId: s.presetId,
        editorPath: s.editorPath,
      }),
    },
  ),
)
