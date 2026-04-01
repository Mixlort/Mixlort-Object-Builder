import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './providers/ThemeProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { App } from './App'
import { DetachedObjectViewerWindow } from './features/viewer'
import './i18n' // Initialize i18next before rendering
import './styles/global.css'

// ---------------------------------------------------------------------------
// Global error handlers (renderer process)
// ---------------------------------------------------------------------------

window.addEventListener('error', (event) => {
  const message = event.error?.message || event.message || 'Unknown error'
  const stack = event.error?.stack
  if (window.api?.log) {
    window.api.log.write('error', `Uncaught error: ${message}${stack ? '\n' + stack : ''}`)
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  if (window.api?.log) {
    window.api.log.write('error', `Unhandled rejection: ${message}${stack ? '\n' + stack : ''}`)
  }
})

// ---------------------------------------------------------------------------
// React root
// ---------------------------------------------------------------------------

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

const windowMode = new URLSearchParams(window.location.search).get('window')
const RootComponent = windowMode === 'object-viewer' ? DetachedObjectViewerWindow : App

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <RootComponent />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)
