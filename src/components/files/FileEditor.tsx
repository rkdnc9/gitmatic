import CodeMirror from '@uiw/react-codemirror'
import { useRef } from 'react'
import { useSandbox } from '../../store/sandbox'
import { conflictHighlight } from './conflictHighlight'

/**
 * A single-file editor backed by the sandbox workdir. Reads the file's current
 * content, edits in CodeMirror, and persists via the store's `saveFile` on
 * Ctrl+S or the Save button. `Close` dismisses the panel. Conflict-marker lines
 * are tinted so a merge conflict in the open file is obvious.
 *
 * The <CodeMirror> is keyed by `path`: switching files remounts it (re-initializing
 * its value) without a setState-in-effect. `current` mirrors the latest editor
 * text so the Save button (outside the editor) always saves what is on screen.
 */
export default function FileEditor({ path }: { path: string }) {
  const world = useSandbox((s) => s.world)
  const initial = world.files[world.cwd]?.[path] ?? ''
  const current = useRef(initial)

  const save = () => useSandbox.getState().saveFile(path, current.current)

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-700 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-zinc-300">{path}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-amber-500 px-3 py-1 text-xs font-bold text-zinc-900 hover:bg-amber-400"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => useSandbox.getState().closeEditor()}
            className="rounded-md border border-zinc-600 px-3 py-1 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
      <CodeMirror
        key={path}
        value={initial}
        height="220px"
        style={{ fontSize: 13 }}
        extensions={[conflictHighlight]}
        basicSetup={{ lineNumbers: true }}
        onChange={(next) => {
          current.current = next
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault()
            save()
            return true
          }
          return false
        }}
      />
    </div>
  )
}