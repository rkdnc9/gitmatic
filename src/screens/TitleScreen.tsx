import { Link } from 'react-router'

export default function TitleScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-5xl font-bold">gitmatic</h1>
      <nav className="flex gap-4">
        <Link to="/free" className="underline">
          Free mode
        </Link>
        <Link to="/settings" className="underline">
          Settings
        </Link>
      </nav>
    </main>
  )
}
