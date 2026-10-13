import { createHashRouter, RouterProvider } from 'react-router'
import FreeModeScreen from './screens/FreeModeScreen'
import SettingsScreen from './screens/SettingsScreen'
import TitleScreen from './screens/TitleScreen'

const router = createHashRouter([
  { path: '/', element: <TitleScreen /> },
  { path: '/free', element: <FreeModeScreen /> },
  { path: '/settings', element: <SettingsScreen /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
