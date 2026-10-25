import { createWorld, runCommand } from '../engine'
import type { World } from '../engine'

export type PresetId = 'blank' | 'fresh-project' | 'feature-branch' | 'conflict-waiting'

export interface Preset {
  title: string
  description: string
  script: string[]
}

/**
 * Starter scenarios for the sandbox. Each script is a list of command lines that
 * all run successfully against a fresh world; `buildPreset` replays them.
 *
 * The scripts are plain commands on purpose — they double as documentation of
 * what each scenario looks like, and any change to them must keep every line
 * `ok` (asserted in presets.test.ts).
 */
export const PRESETS: Record<PresetId, Preset> = {
  blank: {
    title: 'Blank',
    description: 'An empty folder — no git repository yet.',
    script: [],
  },
  'fresh-project': {
    title: 'Fresh project',
    description: 'A brand-new repository with one commit on main.',
    script: [
      'git init',
      'echo "line1" > notes.txt',
      'git add notes.txt',
      'git commit -m "first note"',
    ],
  },
  'feature-branch': {
    title: 'Feature branch',
    description: 'Work in progress on a feature branch ahead of main.',
    script: [
      'git init',
      'echo "line1" > notes.txt',
      'git add notes.txt',
      'git commit -m "first"',
      'git switch -c feature',
      'echo "line2" > notes.txt',
      'git add notes.txt',
      'git commit -m "second"',
    ],
  },
  'conflict-waiting': {
    title: 'Conflict waiting',
    description:
      'main and feature both changed the same line; git merge feature is about to conflict.',
    script: [
      'git init',
      'echo "line1" > notes.txt',
      'git add notes.txt',
      'git commit -m "first"',
      'git branch feature',
      'echo "main-edit" > notes.txt',
      'git commit -am "main edit"',
      'git switch feature',
      'echo "feat-edit" > notes.txt',
      'git commit -am "feat edit"',
      'git switch main',
    ],
  },
}

/**
 * Replays `id`'s script on a fresh world. Throws with the offending line when
 * any command fails, so preset drift is loud instead of subtle.
 */
export function buildPreset(id: PresetId): World {
  let w = createWorld()
  for (const line of PRESETS[id].script) {
    const r = runCommand(w, line)
    if (!r.ok) {
      const detail = r.output.map((l) => l.text).join(' | ')
      throw new Error(`Preset '${id}' line failed: ${line} — ${detail}`)
    }
    w = r.world
  }
  return w
}
