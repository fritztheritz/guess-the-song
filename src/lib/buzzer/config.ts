// Same Cloudflare Worker as the SoundCloud token proxy (see soundcloud/config.ts) — the
// buzzer's WebSocket route lives alongside it rather than in a separate deployed Worker,
// so there's only one URL to configure and deploy.
const BUZZER_WORKER_URL = import.meta.env.VITE_SOUNDCLOUD_TOKEN_PROXY_URL ?? ''

export function isBuzzerConfigured(): boolean {
  return BUZZER_WORKER_URL.length > 0
}

/** wss://.../buzzer/<CODE>?role=host|player — the Worker upgrades this to a WebSocket. */
export function buzzerSocketUrl(code: string, role: 'host' | 'player'): string {
  const wsUrl = BUZZER_WORKER_URL.replace(/^http/, 'ws')
  return `${wsUrl}/buzzer/${encodeURIComponent(code)}?role=${role}`
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // skips 0/O, 1/I/L — read off a screen

export function generateRoomCode(length = 4): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]
  }
  return code
}
