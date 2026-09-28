import type { DraftBoard, DraftSession } from '../types/draft'
import { computeDraftStandings } from '../types/draft'

// Same self-contained-link convention as game-share.ts: no backend to hand back a short id
// against, so the whole result set travels inside the URL. gzip (Compression Streams API)
// keeps it a reasonable length; a leading marker byte records whether that succeeded, so a
// link built by a browser with compression support still opens in one without it.
const RAW_MARKER = 0
const GZIP_MARKER = 1

export interface ShareableDraftResults {
  boardName: string
  sessionName: string
  completedAt?: string
  standings: Array<{
    name: string
    color: string
    avatar?: string
    points: number
    songs: Array<{ title: string; artist: string }>
  }>
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

async function gzip(bytes: Uint8Array<ArrayBufferLike>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes: Uint8Array<ArrayBufferLike>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Builds a self-contained, read-only link to a completed draft session's results (`/share/results?data=...`). */
export async function buildDraftResultsShareUrl(board: DraftBoard, session: DraftSession): Promise<string> {
  const standings = computeDraftStandings(session).map((standing) => {
    const songs = session.picks
      .filter((p) => p.drafterId === standing.drafterId)
      .map((p) => board.songPool.find((song) => song.id === p.songId))
      .filter((song): song is NonNullable<typeof song> => !!song)
      .map((song) => ({ title: song.title, artist: song.artist }))
    return { name: standing.name, color: standing.color, avatar: standing.avatar, points: standing.points, songs }
  })

  const payload: ShareableDraftResults = {
    boardName: board.name,
    sessionName: session.name,
    completedAt: session.completedAt,
    standings,
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload))

  const canCompress = typeof CompressionStream !== 'undefined'
  const bodyBytes = canCompress ? await gzip(jsonBytes) : jsonBytes

  const combined = new Uint8Array(bodyBytes.length + 1)
  combined[0] = canCompress ? GZIP_MARKER : RAW_MARKER
  combined.set(bodyBytes, 1)

  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '')
  return `${base}/share/results?data=${bytesToBase64Url(combined)}`
}

export class DraftShareLinkError extends Error {}

/** Decodes a shared draft-results link's `data` param back into its payload. */
export async function parseDraftResultsShareData(encoded: string): Promise<ShareableDraftResults> {
  let combined: Uint8Array
  try {
    combined = base64UrlToBytes(encoded)
  } catch {
    throw new DraftShareLinkError('This link is broken or was cut off — ask for it to be shared again.')
  }
  if (combined.length === 0) throw new DraftShareLinkError('This link is missing its results data.')

  const marker = combined[0]
  const bodyBytes = combined.slice(1)

  let jsonBytes: Uint8Array<ArrayBufferLike> = bodyBytes
  if (marker === GZIP_MARKER) {
    if (typeof DecompressionStream === 'undefined') {
      throw new DraftShareLinkError('This link needs a more modern browser to open.')
    }
    try {
      jsonBytes = await gunzip(bodyBytes)
    } catch {
      throw new DraftShareLinkError('This link is broken or was cut off — ask for it to be shared again.')
    }
  }

  let data: unknown
  try {
    data = JSON.parse(new TextDecoder().decode(jsonBytes))
  } catch {
    throw new DraftShareLinkError('This link is broken or was cut off — ask for it to be shared again.')
  }

  if (
    !data ||
    typeof data !== 'object' ||
    typeof (data as ShareableDraftResults).sessionName !== 'string' ||
    !Array.isArray((data as ShareableDraftResults).standings)
  ) {
    throw new DraftShareLinkError("This link doesn't look like a valid results link.")
  }

  return data as ShareableDraftResults
}
