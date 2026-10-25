import { useMemo } from 'react'
import { getStatus, headCommit } from '../../engine'
import { useSandbox } from '../../store/sandbox'

/**
 * The three "areas" of a git worktree — Working directory, Staging area, and
 * Last commit — laid out left→right with `->` arrows between them.
 *
 * Rows are derived from `getStatus(world)` (workdir + index vs HEAD) and the
 * HEAD commit's tree. Badges are TEXT chips (e.g. `[modified]`, `[new]`,
 * `[deleted]`, `[conflict]`), never colour alone. Empty columns show a muted
 * `—`.
 */

/** The visible state for one path, in a given column. */
type Row = { path: string; badge: string }

function truncatePath(p: string, max = 24): string {
  return p.length > max ? p.slice(0, max - 1) + '…' : p
}

function Text({ children, muted = false }: { children: string; muted?: boolean }) {
  return <span className={muted ? 'text-zinc-600' : 'text-zinc-300'}>{children}</span>
}

function Column({
  title,
  rows,
  ariaLabel,
}: {
  title: string
  rows: Row[]
  ariaLabel: string
}) {
  return (
    <div className="flex min-w-[180px] flex-1 flex-col gap-1" aria-label={ariaLabel}>
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600">—</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.path} className="flex items-center gap-2 text-sm">
              <Text>{truncatePath(r.path)}</Text>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                [{r.badge}]
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AreasStrip() {
  const world = useSandbox((s) => s.world)

  const { workRows, stagedRows, lastRows } = useMemo(() => {
    const entries = getStatus(world)
    const repo = world.repo
    const wt = repo?.worktrees[world.cwd]

    const workRows: Row[] = []
    const stagedRows: Row[] = []
    for (const e of entries) {
      // A conflicted path shows a `conflict` badge wherever it appears.
      const conflict = e.conflicted ? 'conflict' : null
      if (e.work !== null) workRows.push({ path: e.path, badge: conflict ?? e.work })
      if (e.index !== null) stagedRows.push({ path: e.path, badge: conflict ?? e.index })
    }

    // Last commit: the HEAD commit's files.
    let lastRows: Row[] = []
    if (repo && wt) {
      const head = headCommit(repo, wt)
      if (head) {
        const tree = repo.commits[head]?.tree ?? {}
        lastRows = Object.keys(tree)
          .sort()
          .map((p) => ({ path: p, badge: 'in commit' }))
      }
    }
    return { workRows, stagedRows, lastRows }
  }, [world])

  return (
    <div className="flex items-stretch gap-3 rounded-xl border border-zinc-700 bg-zinc-900/40 p-3">
      <Column title="Working directory" rows={workRows} ariaLabel="Working directory" />
      <div className="flex items-center text-zinc-500" aria-hidden="true">
        -&gt;
      </div>
      <Column title="Staging area" rows={stagedRows} ariaLabel="Staging area" />
      <div className="flex items-center text-zinc-500" aria-hidden="true">
        -&gt;
      </div>
      <Column title="Last commit" rows={lastRows} ariaLabel="Last commit" />
    </div>
  )
}
