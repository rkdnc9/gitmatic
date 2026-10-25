import { useState } from 'react'
import { Link } from 'react-router'
import AreasStrip from '../components/areas/AreasStrip'
import FileEditor from '../components/files/FileEditor'
import FilePanel from '../components/files/FilePanel'
import GraphView from '../components/graph/GraphView'
import { HowDoIPanel } from '../components/howdoi/HowDoIPanel'
import { SuggestionChips } from '../components/terminal/SuggestionChips'
import { Terminal } from '../components/terminal/Terminal'
import { BigButton } from '../components/ui/BigButton'
import { Panel } from '../components/ui/Panel'
import { PRESETS } from '../content/presets'
import type { PresetId } from '../content/presets'
import { useSandbox } from '../store/sandbox'
import { useTerminalInput } from '../store/terminalInput'

/**
 * Free mode: the main sandbox screen. A header with the app wordmark, a
 * preset picker and a Reset button, and a body grid — commit graph on top,
 * the areas strip below it, the terminal in the bottom-left, and a tabbed
 * side panel ("How do I…?" / "Files") on the right.
 *
 * It renders purely from the persisted store state: no auto-reset on mount.
 * "Reset" asks first (window.confirm), then rebuilds the selected preset.
 */
export default function FreeModeScreen() {
  // Track the sandbox's preset so the picker always reflects what is loaded.
  // A fresh (blank) world defaults the picker to 'fresh-project' — the
  // recommended starter — so a first-time visitor sees something to run.
  const [presetId, setPresetId] = useState<PresetId>(() => {
    const stored = useSandbox.getState().presetId
    return stored === 'blank' ? 'fresh-project' : stored
  })
  const editorPath = useSandbox((s) => s.editorPath)
  const [tab, setTab] = useState<'howdoi' | 'files'>('howdoi')

  function handlePresetChange(id: PresetId): void {
    setPresetId(id)
    useSandbox.getState().reset(id)
  }

  function handleReset(): void {
    if (window.confirm('Reset the sandbox?')) useSandbox.getState().reset(presetId)
  }

  return (
    <div className="free-screen">
      <header className="free-header">
        <Link to="/" className="wordmark">
          gitmatic
        </Link>
        <h1>Free mode</h1>
        <div className="free-header-controls">
          <label className="free-preset">
            <span>Preset</span>
            <select
              value={presetId}
              onChange={(e) => handlePresetChange(e.target.value as PresetId)}
            >
              {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                <option key={id} value={id}>
                  {PRESETS[id].title}
                </option>
              ))}
            </select>
          </label>
          <BigButton variant="ghost" onClick={handleReset}>
            Reset
          </BigButton>
        </div>
      </header>

      <main className="free-body">
        <div className="free-main">
          <Panel title="Commit graph" className="free-graph">
            <GraphView />
          </Panel>
          <AreasStrip />
          <div className="free-terminal">
            <Terminal />
            <SuggestionChips
              onPick={(cmd) => useTerminalInput.getState().focusTerminalWithText(cmd)}
            />
          </div>
        </div>

        <aside className="free-side">
          <Panel className="free-side-panel">
            <div className="tablist" role="tablist" aria-label="Side panel tabs">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'howdoi'}
                className={tab === 'howdoi' ? 'tab tab-active' : 'tab'}
                onClick={() => setTab('howdoi')}
              >
                How do I…?
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'files'}
                className={tab === 'files' ? 'tab tab-active' : 'tab'}
                onClick={() => setTab('files')}
              >
                Files
              </button>
            </div>
            {tab === 'howdoi' ? (
              <HowDoIPanel />
            ) : (
              <div className="free-files">
                {editorPath !== null && <FileEditor path={editorPath} />}
                <FilePanel />
              </div>
            )}
          </Panel>
        </aside>
      </main>
    </div>
  )
}
