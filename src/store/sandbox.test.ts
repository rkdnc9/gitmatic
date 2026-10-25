import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorld } from '../engine'
import { buildPreset } from '../content/presets'

const SBOX_KEY = 'gitmatic:sandbox'

type SandboxModule = typeof import('../store/sandbox')

/**
 * The store is a module-level singleton (persist hydrates once at creation),
 * so each test re-instantiates the module to control what localStorage holds
 * when the store is created. This dynamic import is the intentional
 * module-loading boundary, not a lazily loaded dependency. Tests set
 * localStorage themselves before calling this.
 */
async function loadSandbox(): Promise<SandboxModule> {
  vi.resetModules()
  const mod = await import('../store/sandbox')
  // Let persist finish rehydrating (async in zustand) so the store is in its
  // final hydrated state before the test mutates it.
  await new Promise<void>((resolve) => {
    if (mod.useSandbox.persist.hasHydrated()) resolve()
    else mod.useSandbox.persist.onFinishHydration(() => resolve())
  })
  return mod
}

describe('useSandbox.run', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('appends the input line, the engine output, and the note', async () => {
    const { useSandbox } = await loadSandbox()
    useSandbox.getState().run('git init')
    const lines = useSandbox.getState().lines
    expect(lines.map((l) => l.kind)).toEqual(['input', 'ok', 'note'])
    expect(lines.map((l) => l.text)).toEqual([
      'git init',
      'Initialized empty Git repository in /project/.git/',
      'Initialized empty Git repository in /project/.git/',
    ])
    expect(useSandbox.getState().world.repo).not.toBeNull()
    expect(useSandbox.getState().history).toEqual(['git init'])
  })

  it('caps history at 100 and drops the oldest', async () => {
    const { useSandbox } = await loadSandbox()
    for (let i = 0; i < 120; i++) useSandbox.getState().run(`echo ${i}`)
    const history = useSandbox.getState().history
    expect(history).toHaveLength(100)
    expect(history[0]).toBe('echo 20')
    expect(history.at(-1)).toBe('echo 119')
  })

  it('caps the transcript at the last 500 lines', async () => {
    const { useSandbox } = await loadSandbox()
    for (let i = 0; i < 300; i++) useSandbox.getState().run(`echo ${i}`)
    const lines = useSandbox.getState().lines
    // 2 lines per echo (input, out) → 600 total, keep the last 500.
    expect(lines).toHaveLength(500)
    expect(lines[0]).toMatchObject({ kind: 'input', text: 'echo 50' })
    expect(lines.at(-1)).toMatchObject({ kind: 'out', text: '299' })
  })

  it('clears the transcript on a clear effect but keeps history', async () => {
    const { useSandbox } = await loadSandbox()
    useSandbox.getState().run('echo before')
    useSandbox.getState().run('clear')
    expect(useSandbox.getState().lines).toEqual([])
    expect(useSandbox.getState().history).toEqual(['echo before', 'clear'])
  })

  it('opens the editor on an open-editor effect', async () => {
    const { useSandbox } = await loadSandbox()
    useSandbox.getState().run('edit notes.txt')
    expect(useSandbox.getState().editorPath).toBe('notes.txt')
    useSandbox.getState().closeEditor()
    expect(useSandbox.getState().editorPath).toBeNull()
  })

  it('persists the world to localStorage after a run', async () => {
    const { useSandbox } = await loadSandbox()
    useSandbox.getState().run('git init')
    const stored = JSON.parse(localStorage.getItem(SBOX_KEY)!)
    expect(stored.version).toBe(1)
    expect(stored.state.world.repo).not.toBeNull()
    expect(stored.state.world.version).toBe(1)
  })
})

describe('useSandbox rehydration', () => {
  it('falls back to a blank world when stored JSON is invalid', async () => {
    localStorage.setItem(SBOX_KEY, '{not json')
    const { useSandbox } = await loadSandbox()
    expect(useSandbox.getState().world).toEqual(createWorld())
    expect(useSandbox.getState().lines).toEqual([])
    expect(useSandbox.getState().presetId).toBe('blank')
  })

  it('migrates an old version to a fresh blank world', async () => {
    localStorage.setItem(SBOX_KEY, JSON.stringify({ version: 0, state: { world: null } }))
    const { useSandbox } = await loadSandbox()
    expect(useSandbox.getState().world).toEqual(createWorld())
    expect(useSandbox.getState().lines).toEqual([])
    expect(useSandbox.getState().presetId).toBe('blank')
  })

  it('rehydrates a stored sandbox', async () => {
    const world = buildPreset('feature-branch')
    const state = {
      version: 1,
      state: {
        world,
        lines: [],
        history: ['git init'],
        presetId: 'feature-branch',
        editorPath: null,
      },
    }
    localStorage.setItem(SBOX_KEY, JSON.stringify(state))
    const { useSandbox } = await loadSandbox()
    expect(useSandbox.getState().world).toEqual(world)
    expect(useSandbox.getState().presetId).toBe('feature-branch')
    expect(useSandbox.getState().history).toEqual(['git init'])
  })
})

describe('useSandbox.reset', () => {
  it('rebuilds the given preset and clears the transcript', async () => {
    const { useSandbox } = await loadSandbox()
    useSandbox.getState().run('git init')
    useSandbox.getState().reset('conflict-waiting')
    const s = useSandbox.getState()
    expect(s.world).toEqual(buildPreset('conflict-waiting'))
    expect(s.lines).toEqual([])
    expect(s.history).toEqual([])
    expect(s.presetId).toBe('conflict-waiting')
    expect(s.editorPath).toBeNull()
  })

  it('resets to blank when no preset is given', async () => {
    const { useSandbox } = await loadSandbox()
    useSandbox.getState().reset('conflict-waiting')
    useSandbox.getState().reset()
    const s = useSandbox.getState()
    expect(s.world).toEqual(buildPreset('blank'))
    expect(s.presetId).toBe('blank')
    expect(s.lines).toEqual([])
  })

  it('a conflict-waiting reset then merge conflicts on notes.txt', async () => {
    const { useSandbox } = await loadSandbox()
    useSandbox.getState().reset('conflict-waiting')
    useSandbox.getState().run('git merge feature')
    const s = useSandbox.getState()
    const wt = s.world.repo!.worktrees[s.world.cwd]
    expect(wt.pending).not.toBeNull()
    expect(wt.pending!.conflicts).toEqual(['notes.txt'])
    const notes = s.world.files[s.world.cwd]['notes.txt']
    expect(notes).toContain('<<<<<<< HEAD')
    expect(notes).toContain('>>>>>>> feature')
  })

  it('saveFile writes into the workdir and closes the editor', async () => {
    const { useSandbox } = await loadSandbox()
    useSandbox.getState().reset('fresh-project')
    useSandbox.getState().saveFile('notes.txt', 'line1\nline2')
    const s = useSandbox.getState()
    expect(s.world.files[s.world.cwd]['notes.txt']).toBe('line1\nline2')
    expect(s.editorPath).toBeNull()
  })
})
