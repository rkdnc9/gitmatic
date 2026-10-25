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
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/40">
        <p className="text-sm text-zinc-400">No files</p>
        <p className="text-xs text-zinc-600">
          Create one, e.g. <code className="font-mono">echo "hi" &gt; notes.txt</code>
        </p>
      </div>
    )
  }

  return (
    <div
      role="list"
      aria-label="Files"
      className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/40"
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
                ? 'bg-zinc-700/60 text-zinc-100'
                : 'text-zinc-300 hover:bg-zinc-800/60'
            }`}
          >
            <span className={active ? 'text-zinc-100' : 'text-zinc-500'}>{active ? '●' : '○'}</span>
            {f}
          </button>
        )
      })}
    </div>
  )
}
