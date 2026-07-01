import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { BootSplash } from './components/BootSplash'
import { ErrorBoundary } from './ErrorBoundary'
import './assets/main.css'
import './companionSkin/registerBuiltins'
import { applyTheme, initThemeSync, resolveInitialTheme } from './lib/theme'
import { dismissBootSplash, markBootSplashBooting } from './lib/bootSplash'

applyTheme(resolveInitialTheme())
initThemeSync()
markBootSplashBooting()

const splashMount = document.getElementById('ackem-boot-splash')
if (splashMount) {
  ReactDOM.createRoot(splashMount).render(
    <React.StrictMode>
      <BootSplash />
    </React.StrictMode>
  )
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  dismissBootSplash()
  document.body.innerHTML =
    '<p style="font-family:system-ui;padding:24px;color:#e8e0d0;background:#0f0d14">Missing #root in index.html</p>'
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}
