import type { AudioSource, PlaybackSource, TrackMetadata } from './types'
import { getSpotifyPlayerManager } from '../spotify/spotify-player'
import type { SongRound } from '../../types'

// Doesn't extend BaseAudioSource — that class manages a fresh <audio> element per clip,
// which doesn't apply here: Spotify plays through one page-lifetime Player object (see
// spotify-player.ts) that this just delegates to, so the rest of the app (HostController,
// ClipEditor) can keep treating every source the same via the plain AudioSource interface.
export class SpotifyAudioSource implements AudioSource {
  private round: SongRound

  constructor(round: SongRound) {
    this.round = round
  }

  async getMetadata(): Promise<TrackMetadata> {
    return {
      title: this.round.title,
      artist: this.round.artist,
      artworkUrl: this.round.artworkUrl,
      duration: this.round.duration,
    }
  }

  async getPlaybackSource(): Promise<PlaybackSource> {
    // Playback goes through the Web Playback SDK's managed player, not a fetchable URL —
    // this only exists to satisfy AudioSource's shape; play() below never calls it.
    throw new Error('SpotifyAudioSource has no direct playback URL.')
  }

  async play(startTime: number, duration: number): Promise<void> {
    if (!this.round.spotifyUri) {
      throw new Error('Round is missing a Spotify track URI.')
    }
    await getSpotifyPlayerManager().playClip(this.round.spotifyUri, Math.round(startTime * 1000), Math.round(duration * 1000))
  }

  stop(): void {
    getSpotifyPlayerManager().stop()
  }
}
