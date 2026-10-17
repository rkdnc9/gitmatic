import { runCommand } from './run'
import type { CommandResult, World } from './types'
import { createWorld } from './world'

/** Runs `lines` in order (failures don't stop the script), like typing them into the terminal. */
export function exec(
  lines: string[],
  world: World = createWorld(),
): { world: World; last: CommandResult; all: CommandResult[] } {
  const all: CommandResult[] = []
  let w = world
  for (const line of lines) {
    const r = runCommand(w, line)
    all.push(r)
    w = r.world
  }
  const last = all.at(-1) ?? { world: w, output: [], note: null, effects: [], ok: true }
  return { world: w, last, all }
}

export function text(r: CommandResult): string {
  return r.output.map((l) => l.text).join('\n')
}
