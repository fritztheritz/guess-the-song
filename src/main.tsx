import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { SoundCloudProvider } from './state/SoundCloudContext.tsx'

// HashRouter avoids the GitHub Pages "no server-side rewrite" problem entirely —
// every route lives under the same static index.html, no 404.html fallback trick needed.
//
// The one wrinkle: SoundCloud's OAuth redirect is a full-page navigation to the app's
// root (see soundcloud/config.ts), landing the response as ?code=...&state=... in
// location.search — but HashRouter only reads routes from location.hash. Move it
// into the hash before the router mounts, so it reaches the /callback route.
if (window.location.search.includes('code=') || window.location.search.includes('error=')) {
  const target = `${window.location.pathname}#/callback${window.location.search}`
  window.history.replaceState(null, '', target)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <SoundCloudProvider>
        <App />
      </SoundCloudProvider>
    </HashRouter>
  </StrictMode>,
)
