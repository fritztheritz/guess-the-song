import { createEmptyRound, type HigherLowerRef, type SongRound } from '../types'
import type { TierList, TierListSong } from '../types/tierlist'

// Higher or Lower: each round names a song and asks whether it's ranked higher (nearer #1) or lower
// than the previous card, using a tier list's own order as the answer. Pure helpers so the rules —
// ranking, chaining, grading — can be tested away from the screens.

export interface RankInfo {
  rank: number
  size: number
  tierName: string
}

/** Every ranked song's place in the whole list: 1 = first in the top tier, counting down through the
 *  tiers in order. Unranked songs have none (they can't be compared). */
export function rankSongs(list: TierList): Map<string, RankInfo> {
  const ranked = list.tiers.flatMap((tier) =>
    list.songs
      .filter((s) => s.tierId === tier.id)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ song: s, tierName: tier.name })),
  )
  return new Map(ranked.map(({ song, tierName }, i) => [song.id, { rank: i + 1, size: ranked.length, tierName }]))
}

const refOf = (song: TierListSong, info: RankInfo): HigherLowerRef => ({
  title: song.title,
  artist: song.artist,
  artworkUrl: song.artworkUrl,
  rank: info.rank,
  tierName: info.tierName,
})

/** A target round's own card, as the next round's reference. */
export const refFromRound = (round: SongRound): HigherLowerRef | null =>
  round.higherLower ? { title: round.title, artist: round.artist, artworkUrl: round.artworkUrl, rank: round.higherLower.rank, tierName: round.higherLower.tierName } : null

/**
 * Rounds for `songs` (in the order they'll be played), each compared with the one before it. With
 * `after` (the last existing round) the first new song is compared with that; otherwise the first
 * song is the opening card and gets no round of its own. Songs that aren't ranked are skipped.
 */
export function buildHigherLowerRounds(songs: TierListSong[], list: TierList, after?: SongRound): SongRound[] {
  const ranks = rankSongs(list)
  const playable = songs.filter((s) => ranks.has(s.id))
  let ref = after ? refFromRound(after) : null
  const rounds: SongRound[] = []
  for (const song of playable) {
    const info = ranks.get(song.id)!
    if (ref) {
      rounds.push(
        createEmptyRound({
          source: 'soundcloud',
          title: song.title,
          artist: song.artist,
          artworkUrl: song.artworkUrl,
          soundcloudTrackId: song.soundcloudTrackId,
          soundcloudUrn: song.soundcloudUrn,
          soundcloudUrl: song.soundcloudUrl,
          soundcloudSecretToken: song.soundcloudSecretToken,
          higherLower: { rank: info.rank, size: info.size, tierName: info.tierName, ref },
        }),
      )
    }
    ref = refOf(song, info)
  }
  return rounds
}

/** Re-links every round to the one before it after rounds were shuffled, removed or added. The first
 *  round keeps whatever opening card it already had. */
export function rechainRounds(rounds: SongRound[]): SongRound[] {
  return rounds.map((r, i) => {
    if (!r.higherLower || i === 0) return r
    const ref = refFromRound(rounds[i - 1])
    return ref ? { ...r, higherLower: { ...r.higherLower, ref } } : r
  })
}

export type HigherLowerGuess = 'higher' | 'lower'

/** The right answer for a round: "higher" when it outranks the reference (a smaller rank number). */
export function correctAnswer(card: { rank: number; ref: { rank: number } }): HigherLowerGuess {
  return card.rank < card.ref.rank ? 'higher' : 'lower'
}

/** Reads a typed/tapped guess ("Higher", "lower", "H", "↑"); null when it isn't one. */
export function parseGuess(text: string): HigherLowerGuess | null {
  const t = text.trim().toLowerCase()
  if (t === 'higher' || t === 'h' || t === 'up' || t === '↑' || t === '⬆' || t === '⬆️') return 'higher'
  if (t === 'lower' || t === 'l' || t === 'down' || t === '↓' || t === '⬇' || t === '⬇️') return 'lower'
  return null
}

export function isCorrectGuess(text: string, card: { rank: number; ref: { rank: number } }): boolean {
  return parseGuess(text) === correctAnswer(card)
}
