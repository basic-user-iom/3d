import React from 'react'
import ReactDOM from 'react-dom/client'
import Panorama360App from './Panorama360App'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Panorama360App />
  </React.StrictMode>,
)
