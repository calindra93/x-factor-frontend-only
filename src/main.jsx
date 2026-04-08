import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initErrorReporting } from '@/lib/errorReporting'
import { debugLog, instrumentPreviewDiagnostics } from '@/lib/debug'

initErrorReporting()
instrumentPreviewDiagnostics()
debugLog('boot', { href: typeof window !== 'undefined' ? window.location.href : 'server' })

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
