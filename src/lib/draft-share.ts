import type { DraftBoard, DraftSession } from '../types/draft'
import { computeDraftStandings } from '../types/draft'
import { decodeSharePayload, encodeSharePayload, shareBaseUrl, ShareDecodeError } from './share-encoding'

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
  return `${shareBaseUrl()}/share/results?data=${await encodeSharePayload(payload)}`
}

export class DraftShareLinkError extends Error {}

/** Decodes a shared draft-results link's `data` param back into its payload. */
export async function parseDraftResultsShareData(encoded: string): Promise<ShareableDraftResults> {
  let data: unknown
  try {
    data = await decodeSharePayload(encoded, 'This link is missing its results data.')
  } catch (err) {
    throw new DraftShareLinkError(
      err instanceof ShareDecodeError ? err.message : 'This link is broken or was cut off — ask for it to be shared again.',
    )
  }

  if (!isShareableDraftResults(data)) {
    throw new DraftShareLinkError("This link doesn't look like a valid results link.")
  }

  return data
}

// A hand-edited/truncated link can still decode as *some* valid JSON without matching this
// shape — checking only sessionName/standings-is-an-array (as a prior version of this function
// did) let malformed entries through, and SharedDraftResults.tsx crashes on e.g.
// standing.songs.length when songs is missing, rather than showing the friendly "LINK FAILED"
// message this validation exists to enable.
function isShareableDraftResults(data: unknown): data is ShareableDraftResults {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (typeof d.sessionName !== 'string' || !Array.isArray(d.standings)) return false
  return d.standings.every(isStandingsEntry)
}

function isStandingsEntry(entry: unknown): entry is ShareableDraftResults['standings'][number] {
  if (!entry || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>
  if (typeof e.name !== 'string' || typeof e.color !== 'string' || typeof e.points !== 'number') return false
  if (e.avatar !== undefined && typeof e.avatar !== 'string') return false
  if (!Array.isArray(e.songs)) return false
  return e.songs.every(
    (song) => song && typeof song === 'object' && typeof song.title === 'string' && typeof song.artist === 'string',
  )
}
