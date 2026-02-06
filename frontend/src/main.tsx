import React from 'react'
import ReactDOM from 'react-dom/client'
import './shared/i18n' // Initialize i18next
import App from './app/App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

