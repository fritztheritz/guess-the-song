import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { SoundCloudProvider } from './state/SoundCloudContext.tsx'
import { FeatureFlagsProvider } from './state/FeatureFlagsContext.tsx'

// Real paths (no #) on GitHub Pages need the 404.html/index.html SPA-fallback trick
// (public/404.html + the restore script in index.html) since GH Pages can't do
// server-side rewrites — a direct load of /guess-the-song/admin has to round-trip
// through 404.html, which encodes the path and bounces back to index.html, which
// decodes it back into the URL bar before React Router ever sees it.
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '')

// SoundCloud's OAuth redirect is a full-page navigation to the app's root (see
// soundcloud/config.ts) — GitHub Pages only guarantees index.html at the base path
// itself, so the redirect_uri can't point at /callback directly. Move the response
// into the /callback route client-side before the router mounts.
if (window.location.search.includes('code=') || window.location.search.includes('error=')) {
  window.history.replaceState(null, '', `${BASENAME}/callback${window.location.search}`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={BASENAME}>
      <FeatureFlagsProvider>
        <SoundCloudProvider>
          <App />
        </SoundCloudProvider>
      </FeatureFlagsProvider>
    </BrowserRouter>
  </StrictMode>,
)
