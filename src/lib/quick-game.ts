import { createEmptyRound, createGame, createTeam, DEFAULT_CLIP_DURATIONS, type Game, type SongRound } from '../types'
import type { ImportableTrack } from './soundcloud/soundcloud-tracks'
import type { ImportableSpotifyTrack } from './spotify/spotify-tracks'
import { randomTeams } from './team-names'

// "Quick game": turn a pile of imported tracks into a ready-to-play Guess the Song game in one go —
// pick a random handful, give each a clip start that skips the intro, and invent the teams.

export type QuickTrack = ({ source: 'soundcloud' } & ImportableTrack) | ({ source: 'spotify' } & ImportableSpotifyTrack)

export const QUICK_ROUND_CHOICES = [5, 10, 15, 20] as const
export const QUICK_TEAM_CHOICES = [2, 3, 4, 5, 6] as const

const MAX_CLIP = Math.max(...DEFAULT_CLIP_DURATIONS)

export function shuffled<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A clip start past the intro (roughly 15–55% in), always leaving room for the longest clip. Short
 *  or unknown-length tracks just start at 0. */
export function pickClipStart(durationSeconds: number | undefined, rng: () => number = Math.random): number {
  if (!durationSeconds || durationSeconds <= MAX_CLIP + 10) return 0
  const latest = durationSeconds - MAX_CLIP - 2
  const start = durationSeconds * (0.15 + rng() * 0.4)
  return Math.max(0, Math.floor(Math.min(start, latest)))
}

const idOf = (t: QuickTrack): string => (t.source === 'soundcloud' ? `sc:${t.soundcloudTrackId}` : `sp:${t.spotifyTrackId}`)

/** Up to `count` random, de-duplicated, playable rounds from the tracks. */
export function buildQuickRounds(tracks: QuickTrack[], count: number, rng: () => number = Math.random): SongRound[] {
  const seen = new Set<string>()
  const usable = tracks.filter((t) => {
    if (t.source === 'soundcloud' && t.access === 'blocked') return false
    const id = idOf(t)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  return shuffled(usable, rng)
    .slice(0, count)
    .map((t) =>
      t.source === 'soundcloud'
        ? createEmptyRound({
            source: 'soundcloud',
            title: t.title,
            artist: t.artist,
            artworkUrl: t.artworkUrl,
            soundcloudTrackId: t.soundcloudTrackId,
            soundcloudUrn: t.soundcloudUrn,
            soundcloudUrl: t.soundcloudUrl,
            soundcloudSecretToken: t.soundcloudSecretToken,
            isPrivate: t.isPrivate,
            access: t.access,
            duration: t.duration,
            clipStart: pickClipStart(t.duration, rng),
          })
        : createEmptyRound({
            source: 'spotify',
            title: t.title,
            artist: t.artist,
            artworkUrl: t.artworkUrl,
            spotifyTrackId: t.spotifyTrackId,
            spotifyUri: t.spotifyUri,
            spotifyUrl: t.spotifyUrl,
            duration: t.duration,
            clipStart: pickClipStart(t.duration, rng),
          }),
    )
}

export function buildQuickGame(tracks: QuickTrack[], opts: { teamCount: number; roundCount: number; name?: string }, rng: () => number = Math.random): Game {
  const teams = randomTeams(opts.teamCount).map((t) => createTeam(t.name, t.color, t.avatar))
  const game = createGame(opts.name?.trim() || `Quick Game — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, teams, 'song')
  game.rounds = buildQuickRounds(tracks, opts.roundCount, rng)
  return game
}
