import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'



createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

// Service worker alleen in de losse (gehoste) versie: offline werken en installeerbaar op het beginscherm.
if (!__ARTIFACT__ && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => undefined) })
}
