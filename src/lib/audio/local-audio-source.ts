import { BaseAudioSource } from './base-audio-source'
import type { PlaybackSource, TrackMetadata } from './types'
import type { SongRound } from '../../types'

/** Dev/testing fallback for a locally-picked audio file (spec §8, §13). Not for production use. */
export class LocalAudioSource extends BaseAudioSource {
  private round: SongRound

  constructor(round: SongRound) {
    super()
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
    if (!this.round.localAudioUrl) {
      throw new Error('Round is missing a local audio file.')
    }
    return { url: this.round.localAudioUrl, kind: 'local' }
  }
}
