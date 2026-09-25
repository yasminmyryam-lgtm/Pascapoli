import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { initAdSdk } from './ads/adService'
import './index.css'

function paintBootError(err: unknown) {
  const root = document.getElementById('root')
  if (!root) return
  const message = err instanceof Error ? err.message : 'Pastapoli failed to start.'
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#11091c;color:#fff;font-family:Fredoka,Nunito,sans-serif;text-align:center;padding:24px">
      <h1 style="margin:0 0 12px;font-size:28px">Something broke 🍝</h1>
      <p style="margin:0 0 16px;color:rgba(255,255,255,0.6);font-weight:700">The game could not start. Reload the page.</p>
      <p style="margin:0;color:#ff7ad9;font-size:12px;font-weight:700;max-width:28rem">${message.replace(/[<>&]/g, '')}</p>
    </div>
  `
}

try {
  void initAdSdk().catch((err) => console.warn('[ads] SDK init skipped:', err))

  const el = document.getElementById('root')
  if (!el) throw new Error('Missing #root element.')

  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
} catch (err) {
  console.error('[boot]', err)
  paintBootError(err)
}
