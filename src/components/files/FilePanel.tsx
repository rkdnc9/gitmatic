import { useMemo } from 'react'
import { useSandbox } from '../../store/sandbox'

/**
 * Lists the files currently in the working directory (tracked and untracked —
 * `world.files[cwd]` is the full working tree). Each row is a button that
 * opens the file in the editor via the store's `openFile` action; the row of
 * `editorPath` is highlighted.
 */
export default function FilePanel() {
  const world = useSandbox((s) => s.world)
  const editorPath = useSandbox((s) => s.editorPath)

  const files = useMemo(
    () => Object.keys(world.files[world.cwd] ?? {}).sort(),
    [world],
  )

  if (files.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)]">
        <p className="text-sm text-[color:var(--muted)]">No files</p>
        <p className="text-xs text-[color:var(--muted)]">
          Create one, e.g. <code className="font-mono">echo "hi" &gt; notes.txt</code>
        </p>
      </div>
    )
  }

  return (
    <div
      role="list"
      aria-label="Files"
      className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)]"
    >
      {files.map((f) => {
        const active = f === editorPath
        return (
          <button
            key={f}
            type="button"
            role="listitem"
            onClick={() => useSandbox.getState().openFile(f)}
            aria-current={active || undefined}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-sm ${
              active
                ? 'bg-[color:var(--chip-bg)] text-[color:var(--fg)]'
                : 'text-[color:var(--fg)] hover:bg-[color:var(--chip-bg)]'
            }`}
          >
            <span className={active ? 'text-[color:var(--accent)]' : 'text-[color:var(--muted)]'}>{active ? '●' : '○'}</span>
            {f}
          </button>
        )
      })}
    </div>
  )
}
