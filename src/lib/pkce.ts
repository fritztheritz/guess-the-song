// PKCE (RFC 7636) helpers for the Authorization Code + PKCE flow — shared by every OAuth
// provider this app talks to (SoundCloud, Spotify). Running entirely client-side (no
// server) means there is no client secret — PKCE's code_verifier / code_challenge pair is
// what proves possession of the original request instead, which is exactly what a
// public/browser client is for.

function base64UrlEncode(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(64)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes.buffer)
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(digest)
}

/** Prefixed so /callback (shared by every provider) knows which one a redirect belongs to
 *  without needing its own query param — OAuth2 only guarantees us `code`/`state`/`error`. */
export function generateState(prefix: string): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return `${prefix}.${base64UrlEncode(bytes.buffer)}`
}
