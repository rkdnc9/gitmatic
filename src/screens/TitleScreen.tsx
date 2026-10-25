import { Link } from 'react-router'
import { BigButton } from '../components/ui/BigButton'
import AsciiTitle from '../components/ascii/AsciiTitle'

export default function TitleScreen() {
  return (
    <main className="center-screen">
      <AsciiTitle />
      <nav className="title-actions">
        <Link to="/free">
          <BigButton variant="primary">Free mode</BigButton>
        </Link>
        <div>
          <BigButton variant="ghost" disabled>
            Guided lessons
          </BigButton>
          <span className="soon">coming soon</span>
        </div>
        <Link to="/settings">
          <BigButton variant="ghost">Settings</BigButton>
        </Link>
      </nav>
      <div className="title-footer">
        <Link to="/settings">Theme &amp; motion</Link>
      </div>
    </main>
  )
}