// SoundCloud app registration is required — see README.md "SoundCloud setup".
// These come from Vite env vars (.env, not committed) so the client ID never
// lives in source, even though it isn't secret the way a client_secret is.
export const SOUNDCLOUD_CLIENT_ID = import.meta.env.VITE_SOUNDCLOUD_CLIENT_ID ?? ''

// Points at the app's ROOT, not a "/callback" path: GitHub Pages (and the Vite dev
// server) only guarantee index.html is served at the base path itself. A full-page
// OAuth redirect to a nonexistent static path would 404. The root index.html loads,
// and main.tsx's bootstrap rewrites ?code=...&state=... into the #/callback hash
// route before the router mounts, so HashRouter still sees it.
export const SOUNDCLOUD_REDIRECT_URI =
  import.meta.env.VITE_SOUNDCLOUD_REDIRECT_URI ?? `${window.location.origin}${import.meta.env.BASE_URL}`

export const SOUNDCLOUD_AUTHORIZE_URL = 'https://secure.soundcloud.com/authorize'
export const SOUNDCLOUD_API_BASE = 'https://api.soundcloud.com'

// SoundCloud's /oauth/token endpoint requires client_secret even for PKCE flows
// (all SoundCloud clients are currently "confidential" — no self-service public-client
// option, per their docs). A static site can't hold that secret, so token exchange and
// refresh go through the small Cloudflare Worker in /worker instead of hitting
// SoundCloud's token endpoint directly — see worker/README or the main README's
// "SoundCloud token proxy" section for what it does and how to deploy it.
export const SOUNDCLOUD_TOKEN_PROXY_URL = import.meta.env.VITE_SOUNDCLOUD_TOKEN_PROXY_URL ?? ''

// SoundCloud's documented per-client-ID limit on stream-resolution requests.
export const SOUNDCLOUD_STREAM_RATE_LIMIT_PER_DAY = 15000

export function isSoundCloudConfigured(): boolean {
  return SOUNDCLOUD_CLIENT_ID.length > 0 && SOUNDCLOUD_TOKEN_PROXY_URL.length > 0
}
