import { isLyricMode, isTierGuessMode, type Game, type GameMode } from '../types'
import { decodeSharePayload, encodeSharePayload, shareBaseUrl, ShareDecodeError } from './share-encoding'

interface ShareablePayload {
  name: string
  rounds: Game['rounds']
  teams: Array<{ name: string; color: string }>
  /** Absent on links generated before this existed — ImportGame treats that as 'song'. */
  mode?: GameMode
  /** mode: "tierguess" only — rounds reference tier ids from this, so it has to travel with them. */
  tierListTiers?: Game['tierListTiers']
}

/** Builds a self-contained shareable URL for a game (`/import?data=...`). */
export async function buildShareUrl(game: Game): Promise<string> {
  const payload: ShareablePayload = {
    name: game.name,
    rounds: game.rounds,
    teams: game.teams.map((t) => ({ name: t.name, color: t.color })),
    mode: isLyricMode(game) ? 'lyric' : isTierGuessMode(game) ? 'tierguess' : 'song',
    tierListTiers: isTierGuessMode(game) ? game.tierListTiers : undefined,
  }
  return `${shareBaseUrl()}/import?data=${await encodeSharePayload(payload)}`
}

export class ShareLinkError extends Error {}

/** Decodes a shared game link's `data` param back into an importable payload. */
export async function parseShareData(encoded: string): Promise<ShareablePayload> {
  let data: unknown
  try {
    data = await decodeSharePayload(encoded, 'This link is missing its game data.')
  } catch (err) {
    throw new ShareLinkError(err instanceof ShareDecodeError ? err.message : 'This link is broken or was cut off — ask for it to be shared again.')
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
