import { Link } from 'react-router'
import { BigButton } from '../components/ui/BigButton'
import { useSandbox } from '../store/sandbox'
import { useSettings } from '../store/settings'

export default function SettingsScreen() {
  const theme = useSettings((s) => s.theme)
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const setTheme = useSettings((s) => s.setTheme)
  const setReduceMotion = useSettings((s) => s.setReduceMotion)

  const resetSandbox = () => {
    if (window.confirm('Reset the sandbox? Your current workspace will be cleared.')) {
      useSandbox.getState().reset('blank')
    }
  }
  const resetEverything = () => {
    if (window.confirm('Reset everything? This clears the sandbox and your settings.')) {
      window.localStorage.removeItem('gitmatic:sandbox')
      window.localStorage.removeItem('gitmatic:settings')
      useSandbox.getState().reset('blank')
      setTheme('dark')
      setReduceMotion(false)
    }
  }

  return (
    <main className="center-screen">
      <section className="panel settings" aria-label="Settings">
        <h1>Settings</h1>
        <div className="setting-row">
          <span>
            Theme
            <span className="hint">Dark is the default; light for bright rooms.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={theme === 'light'}
            className="toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <span className="sr-only">Light theme</span>
          </button>
        </div>
        <div className="setting-row">
          <span>
            Reduce motion
            <span className="hint">Turns off graph animations and transitions.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={reduceMotion}
            className="toggle"
            onClick={() => setReduceMotion(!reduceMotion)}
          >
            <span className="sr-only">Reduce motion</span>
          </button>
        </div>
        <div className="settings-actions">
          <BigButton variant="ghost" onClick={resetSandbox}>
            Reset sandbox
          </BigButton>
          <BigButton variant="ghost" onClick={resetEverything}>
            Reset everything
          </BigButton>
        </div>
      </section>
      <Link to="/" className="settings-back">
        ← Back to title
      </Link>
    </main>
  )
}