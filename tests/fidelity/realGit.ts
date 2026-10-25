/**
 * Runs a fidelity script against real git: each line is executed via
 * `bash -c <line>` in a fresh tmp directory, with a deterministic git
 * environment (identity, default branch, pinned dates — see GIT_ENV).
 *
 * `runReal` never aborts on a non-zero exit: the engine's `exec` (testing.ts)
 * keeps running after a failing command, so a script line that is expected to
 * fail (a conflicted merge, a refused delete, …) must not stop the script.
 * Exactly like the engine, we continue on to the next line.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { GIT_ENV, snapshotReal, type Snapshot } from './snapshot'

/** True when the `git` binary is on PATH. */
export function gitOnPath(): boolean {
  const r = spawnSync('git', ['--version'], { encoding: 'utf8' })
  return r.status === 0
}

/**
 * Run `lines` in a fresh tmp git dir. `lines[0]` is expected to be `git init`.
 * Returns the real-git snapshot of the final state.
 */
export function runReal(lines: string[]): Snapshot {
  const dir = mkdtempSync(`${tmpdir()}/fid-`)
  try {
    for (const line of lines) {
      // Each line runs in its own shell so the only carried state is the
      // on-disk repo, matching how the engine carries its World across lines.
      // `bash -c` gives us `echo x > file` redirects and the exact quoting a
      // user would type.
      const r = spawnSync('bash', ['-c', line], {
        encoding: 'utf8',
        cwd: dir,
        env: GIT_ENV,
      })
      // A non-zero exit is fine: continue, exactly like the engine's exec().
      void r
    }
    return snapshotReal(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
