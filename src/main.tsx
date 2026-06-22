import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import PathTracerMinimalTest from './PathTracerMinimalTest.tsx'
import Panorama360App from './Panorama360App.tsx'
// Temporary: Path Tracer Only App
// import PathTracerOnlyApp from './PathTracerOnlyApp.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

// Switch between App, PathTracerMinimalTest, and Panorama360App
const USE_MINIMAL_TEST = false
const USE_PANORAMA_360 = new URLSearchParams(window.location.search).get('viewer') === '360'

ReactDOM.createRoot(rootElement).render(
  USE_PANORAMA_360 ? <Panorama360App /> : (USE_MINIMAL_TEST ? <PathTracerMinimalTest /> : <App />)
  // Temporary: <PathTracerOnlyApp />
)

