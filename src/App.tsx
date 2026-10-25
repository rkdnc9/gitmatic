import { useEffect } from 'react'
import { createHashRouter, RouterProvider } from 'react-router'
import FreeModeScreen from './screens/FreeModeScreen'
import SettingsScreen from './screens/SettingsScreen'
import TitleScreen from './screens/TitleScreen'
import { useSettings } from './store/settings'

/** Mirrors the settings store onto `<html>` so the CSS theme tokens switch. */
function ThemeApplier() {
  const theme = useSettings((s) => s.theme)
  const reduceMotion = useSettings((s) => s.reduceMotion)
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.reduceMotion = reduceMotion ? 'true' : 'false'
  }, [theme, reduceMotion])
  return null
}

const router = createHashRouter([
  { path: '/', element: <TitleScreen /> },
  { path: '/free', element: <FreeModeScreen /> },
  { path: '/settings', element: <SettingsScreen /> },
])

export default function App() {
  return (
    <>
      <ThemeApplier />
      <RouterProvider router={router} />
    </>
  )
}