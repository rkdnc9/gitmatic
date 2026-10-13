import { Link } from 'react-router'

export default function SettingsScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      <Link to="/" className="underline">
        Back to title
      </Link>
    </main>
  )
}
