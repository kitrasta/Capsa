import { useEffect } from 'react'
import AppRouter from './router/app-router'
import {
  applyAppearanceSettings,
  getAppearanceSettings,
  subscribeAppearance,
} from '../shared/lib/appearance'

function App() {
  useEffect(() => {
    const apply = () => applyAppearanceSettings(
      getAppearanceSettings(),
      document.documentElement,
    )
    apply()
    return subscribeAppearance(apply)
  }, [])

  return <AppRouter />
}

export default App
