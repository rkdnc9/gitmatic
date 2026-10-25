import { describe, expect, it } from 'vitest'
import { runCommand } from '../engine'
import type { World } from '../engine'
import { headCommit } from '../engine'
import { currentWorktree } from '../engine/world'
import { buildPreset } from './presets'
import type { PresetId } from './presets'
import { HOW_DO_I } from './howdoi'

/**
 * Each "How do I…?" entry's `commands[0]` must be a command the engine
 * actually runs: either it comes back `ok`, or it fails with a real git error
 * (never with the "not a gitmatic command" / "not yet" / "command not found"
 * dispatcher messages). `setup` is a few commands that put the world in the
 * state the command expects, so a typo'd or unsupported command is loud here
 * instead of in the UI.
 */
interface Case {
  preset: PresetId
  setup: string[]
}

const CASES: Record<string, Case> = {
  'undo-last-commit': {
    // Needs a second commit for HEAD~1 to resolve.
    preset: 'feature-branch',
    setup: [],
  },
  'throwaway-file-changes': {
    preset: 'fresh-project',
    setup: ['echo "line2" > notes.txt'],
  },
  'unstage-file': {
    preset: 'fresh-project',
    setup: ['echo "line2" > notes.txt', 'git add notes.txt'],
  },
  'fix-last-commit-message': {
    preset: 'fresh-project',
    setup: [],
  },
  'see-what-changed': {
    // A change (index vs workdir) makes `git diff` print the delta.
    preset: 'fresh-project',
    setup: ['echo "line2" > notes.txt'],
  },
  'rename-branch': {
    // fresh-project only has main; renaming main -> feature is a clean rename.
    preset: 'fresh-project',
    setup: [],
  },
  'delete-merged-branch': {
    // feature must be merged into main before -d allows deletion.
    preset: 'feature-branch',
    setup: ['git switch main', 'git merge feature'],
  },
  'park-work': {
    // An uncommitted tracked change for the stash to pick up.
    preset: 'fresh-project',
    setup: ['echo "line2" > notes.txt'],
  },
  'undo-commit-safely': {
    preset: 'fresh-project',
    setup: [],
  },
  'look-at-old-version': {
    // Needs a second commit so HEAD~1 exists.
    preset: 'fresh-project',
    setup: ['echo "line2" > notes.txt', 'git add notes.txt', 'git commit -m "second note"'],
  },
  'bring-one-commit': {
    // A second branch (other) with a unique commit to pick onto main.
    preset: 'fresh-project',
    setup: [
      'git switch -c other',
      'echo "todo" > todo.txt',
      'git add todo.txt',
      'git commit -m "add todo"',
      'git switch main',
    ],
  },
  'abort-messy-merge': {
    preset: 'conflict-waiting',
    setup: ['git merge feature'],
  },
}

function buildWorld(caseOf: Case): World {
  let w = buildPreset(caseOf.preset)
  for (const s of caseOf.setup) {
    const r = runCommand(w, s)
    if (!r.ok) throw new Error(`setup '${s}' failed: ${r.output.map((l) => l.text).join(' | ')}`)
    w = r.world
  }
  return w
}

describe('HOW_DO_I', () => {
  it('has exactly 12 entries', () => {
    expect(HOW_DO_I).toHaveLength(12)
  })

  it('has unique ids and complete fields', () => {
    const ids = new Set<string>()
    for (const h of HOW_DO_I) {
      expect(h.id, `id ${h.id}`).toMatch(/^[a-z0-9-]+$/)
      expect(ids.has(h.id), `duplicate id ${h.id}`).toBe(false)
      ids.add(h.id)
      expect(h.question.length, `question of ${h.id}`).toBeGreaterThan(0)
      expect(h.keywords.length, `keywords of ${h.id}`).toBeGreaterThan(0)
      expect(h.why.length, `why of ${h.id}`).toBeGreaterThan(0)
      expect(h.commands[0]?.length, `commands[0] of ${h.id}`).toBeGreaterThan(0)
    }
    expect(ids.size).toBe(HOW_DO_I.length)
  })

  it('every commands[0] is recognized by the engine against its preset', () => {
    for (const h of HOW_DO_I) {
      const caseOf = CASES[h.id]
      expect(caseOf, `test case missing for id '${h.id}'`).toBeDefined()

      const w = buildWorld(caseOf)
      const r = runCommand(w, h.commands[0])
      const text = r.output.map((l) => l.text).join('\n')

      if (!r.ok) {
        // A real git error is fine (e.g. "fatal: bad revision"); the
        // dispatcher's "unsupported command" messages are not.
        expect(
          text,
          `commands[0] of ${h.id} failed with a dispatcher message:\n${text}`,
        ).not.toMatch(/not a gitmatic command|doesn't simulate .* yet|command not found/i)
        // And the command must actually be a real git subcommand the engine
        // knows — i.e. it resolved into the command itself.
        expect(text, `commands[0] of ${h.id} did not run a git command:\n${text}`).toMatch(
          /fatal|error|usage|hint/i,
        )
      }
      if (r.ok) {
        // A "recognised but nothing happened" run is a bug in the test
        // scenario; make it visible by asserting the engine did something
        // sensible: the world either changed or a note was attached.
        expect(r.world !== w || r.note !== null || r.output.length > 0).toBe(true)
      }
    }
  })

  it('detached-checkout entry references a real sha in its why', () => {
    // The "look at an old version" entry mentions a sha in its `why`;
    // that sha must be a commit id actually reachable from the fresh-project
    // preset, so the explanation points at something real.
    const entry = HOW_DO_I.find((h) => h.id === 'look-at-old-version')!
    const w = buildPreset('fresh-project')
    const wt = currentWorktree(w)!
    const head = headCommit(w.repo!, wt)!
    const shas = new Set(Object.keys(w.repo!.commits))
    shas.add(head)
    const mentioned = /`git checkout ([a-f0-9]{7,40})`/.exec(entry.why)?.[1]
    expect(mentioned, `sha not found in why: ${entry.why}`).toBeTruthy()
    expect(shas.has(mentioned!), `sha ${mentioned} not in fresh-project`).toBe(true)
  })
})
