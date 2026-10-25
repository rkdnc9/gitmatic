/**
 * Fidelity suite: run each script through the engine (testing.exec) and through
 * real git (runReal), then compare the two Snapshots field-for-field.
 *
 * Skips when git is not on PATH (CI/dev machines without git).
 */
import { describe, expect, it } from 'vitest'
import '../../src/engine/commands'
import { exec } from '../../src/engine/testing'
import { gitOnPath, runReal } from './realGit'
import { snapshotSim, type Snapshot } from './snapshot'
import { scripts } from './scripts'

/** Human-readable diff of the two snapshots, for a failure message. */
function diffSnapshots(engine: Snapshot, real: Snapshot): string {
  const diffs: string[] = []
  if (engine.head !== real.head) diffs.push(`head: engine=${JSON.stringify(engine.head)} real=${JSON.stringify(real.head)}`)
  if (JSON.stringify(engine.branches) !== JSON.stringify(real.branches))
    diffs.push(`branches: engine=${JSON.stringify(engine.branches)} real=${JSON.stringify(real.branches)}`)
  if (JSON.stringify(engine.graph) !== JSON.stringify(real.graph))
    diffs.push(`graph: engine=${JSON.stringify(engine.graph)} real=${JSON.stringify(real.graph)}`)
  if (JSON.stringify(engine.status) !== JSON.stringify(real.status))
    diffs.push(`status: engine=${JSON.stringify(engine.status)} real=${JSON.stringify(real.status)}`)
  if (JSON.stringify(engine.files) !== JSON.stringify(real.files))
    diffs.push(`files: engine=${JSON.stringify(engine.files)} real=${JSON.stringify(real.files)}`)
  return diffs.length === 0 ? 'no differences' : diffs.join('\n')
}

describe.skipIf(!gitOnPath())('fidelity: engine vs real git', () => {
  for (const script of scripts) {
    it(script.name, () => {
      const engine = snapshotSim(exec(script.lines).world)
      const real = runReal(script.lines)
      expect(engine, diffSnapshots(engine, real)).toEqual(real)
    })
  }
})
