import { isLyricMode, type Game, type GameMode } from '../types'

// Shareable links carry the whole game inside the URL — there's no backend to hand back
// a short id against. gzip (via the standard Compression Streams API) keeps a 15-20 track
// game link a reasonable length; a leading marker byte records whether that succeeded, so
// a link built by a browser with compression support still opens in one without it.
const RAW_MARKER = 0
const GZIP_MARKER = 1

interface ShareablePayload {
  name: string
  rounds: Game['rounds']
  teams: Array<{ name: string; color: string }>
  /** Absent on links generated before this existed — ImportGame treats that as 'song'. */
  mode?: GameMode
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// TS's TypedArray generics distinguish Uint8Array<ArrayBuffer> from the looser
// Uint8Array<ArrayBufferLike> that .slice()/TextEncoder.encode() return — copying through
// `new Uint8Array(bytes)` normalizes to a concrete ArrayBuffer-backed copy Blob accepts.
async function gzip(bytes: Uint8Array<ArrayBufferLike>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes: Uint8Array<ArrayBufferLike>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Builds a self-contained shareable URL for a game (`#/import?data=...`). */
export async function buildShareUrl(game: Game): Promise<string> {
  const payload: ShareablePayload = {
    name: game.name,
    rounds: game.rounds,
    teams: game.teams.map((t) => ({ name: t.name, color: t.color })),
    mode: isLyricMode(game) ? 'lyric' : 'song',
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload))

  const canCompress = typeof CompressionStream !== 'undefined'
  const bodyBytes = canCompress ? await gzip(jsonBytes) : jsonBytes

  const combined = new Uint8Array(bodyBytes.length + 1)
  combined[0] = canCompress ? GZIP_MARKER : RAW_MARKER
  combined.set(bodyBytes, 1)

  const base = `${window.location.origin}${import.meta.env.BASE_URL}`
  return `${base}#/import?data=${bytesToBase64Url(combined)}`
}

export class ShareLinkError extends Error {}

/** Decodes a shared game link's `data` param back into an importable payload. */
export async function parseShareData(encoded: string): Promise<ShareablePayload> {
  let combined: Uint8Array
  try {
    combined = base64UrlToBytes(encoded)
  } catch {
    throw new ShareLinkError('This link is broken or was cut off — ask for it to be shared again.')
  }
  if (combined.length === 0) throw new ShareLinkError('This link is missing its game data.')

  const marker = combined[0]
  const bodyBytes = combined.slice(1)

  let jsonBytes: Uint8Array<ArrayBufferLike> = bodyBytes
  if (marker === GZIP_MARKER) {
    if (typeof DecompressionStream === 'undefined') {
      throw new ShareLinkError('This link needs a more modern browser to open.')
    }
    try {
      jsonBytes = await gunzip(bodyBytes)
    } catch {
      throw new ShareLinkError('This link is broken or was cut off — ask for it to be shared again.')
    }
  }

  let data: unknown
  try {
    data = JSON.parse(new TextDecoder().decode(jsonBytes))
  } catch {
    throw new ShareLinkError('This link is broken or was cut off — ask for it to be shared again.')
  }

  if (
    !data ||
    typeof data !== 'object' ||
    typeof (data as ShareablePayload).name !== 'string' ||
    !Array.isArray((data as ShareablePayload).rounds) ||
    !Array.isArray((data as ShareablePayload).teams)
  ) {
    throw new ShareLinkError("This link doesn't look like a valid game link.")
  }

  return data as ShareablePayload
}
