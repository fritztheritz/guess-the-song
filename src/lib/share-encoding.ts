// Shared codec behind every self-contained shareable link in this app (game-share.ts,
// draft-share.ts) — there's no backend to hand back a short id against, so the whole payload
// travels inside the URL. gzip (via the standard Compression Streams API) keeps that a
// reasonable length; a leading marker byte records whether that succeeded, so a link built by
// a browser with compression support still opens in one without it.
export const RAW_MARKER = 0
export const GZIP_MARKER = 1

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// TS's TypedArray generics distinguish Uint8Array<ArrayBuffer> from the looser
// Uint8Array<ArrayBufferLike> that .slice()/TextEncoder.encode() return — copying through
// `new Uint8Array(bytes)` normalizes to a concrete ArrayBuffer-backed copy Blob accepts.
export async function gzip(bytes: Uint8Array<ArrayBufferLike>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function gunzip(bytes: Uint8Array<ArrayBufferLike>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Encodes a JSON-serializable payload the same way every share link in this app does: JSON →
 *  gzip (with a raw fallback marker byte) → base64url. Callers append this to their own path. */
export async function encodeSharePayload(payload: unknown): Promise<string> {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload))
  const canCompress = typeof CompressionStream !== 'undefined'
  const bodyBytes = canCompress ? await gzip(jsonBytes) : jsonBytes

  const combined = new Uint8Array(bodyBytes.length + 1)
  combined[0] = canCompress ? GZIP_MARKER : RAW_MARKER
  combined.set(bodyBytes, 1)
  return bytesToBase64Url(combined)
}

export class ShareDecodeError extends Error {}

/** Reverses encodeSharePayload, returning the decoded JSON value. Callers validate its shape. */
export async function decodeSharePayload(encoded: string, emptyMessage = 'This link is missing its data.'): Promise<unknown> {
  let combined: Uint8Array
  try {
    combined = base64UrlToBytes(encoded)
  } catch {
    throw new ShareDecodeError('This link is broken or was cut off — ask for it to be shared again.')
  }
  if (combined.length === 0) throw new ShareDecodeError(emptyMessage)

  const marker = combined[0]
  const bodyBytes = combined.slice(1)

  let jsonBytes: Uint8Array<ArrayBufferLike> = bodyBytes
  if (marker === GZIP_MARKER) {
    if (typeof DecompressionStream === 'undefined') {
      throw new ShareDecodeError('This link needs a more modern browser to open.')
    }
    try {
      jsonBytes = await gunzip(bodyBytes)
    } catch {
      throw new ShareDecodeError('This link is broken or was cut off — ask for it to be shared again.')
    }
  }

  try {
    return JSON.parse(new TextDecoder().decode(jsonBytes))
  } catch {
    throw new ShareDecodeError('This link is broken or was cut off — ask for it to be shared again.')
  }
}

/** Base URL every share link in this app is built against (origin + the app's base path). */
export function shareBaseUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '')
}
