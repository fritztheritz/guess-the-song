import { BaseAudioSource } from './base-audio-source'
import type { PlaybackSource, TrackMetadata } from './types'
import { getTrackPlayback } from '../soundcloud/soundcloud-playback'
import type { SongRound } from '../../types'

export class SoundCloudAudioSource extends BaseAudioSource {
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
    if (!this.round.soundcloudTrackId) {
      throw new Error('Round is missing a SoundCloud track id.')
    }
    const url = await getTrackPlayback(this.round.soundcloudTrackId, this.round.soundcloudSecretToken)
    return { url, kind: 'soundcloud' }
  }
}
