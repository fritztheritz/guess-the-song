// Spotify app registration — see README.md "Spotify setup". Unlike SoundCloud, Spotify's
// Authorization Code with PKCE flow is designed to be called directly from a browser with
// no client secret at all (their own docs demonstrate a client-side fetch to /api/token),
// so there's no Worker proxy involved here — token exchange happens straight from here.
export const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? ''

export const SPOTIFY_REDIRECT_URI =
  import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? `${window.location.origin}${import.meta.env.BASE_URL}`

export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'

// `streaming` is what lets the Web Playback SDK open a player at all; the rest identify the
// user (SDK requires a display name) and let this app actually start playback of a chosen
// track on that player, which — unlike search/metadata — needs write scope.
export const SPOTIFY_SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state'

export function isSpotifyConfigured(): boolean {
  return SPOTIFY_CLIENT_ID.length > 0
}
