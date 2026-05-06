import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import './index.css'
import App from './App.jsx'

const appVersion = window.__FUEL_APP_VERSION__ || __FUEL_APP_VERSION__ || 'dev'
const versionKey = 'fuel.datavision.appVersion'

const previousVersion = localStorage.getItem(versionKey)
localStorage.setItem(versionKey, appVersion)

if (previousVersion && previousVersion !== appVersion) {
  window.location.reload()
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
