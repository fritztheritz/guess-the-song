import type { SongRound } from '../../types'
import type { AudioSource } from './types'
import { SoundCloudAudioSource } from './soundcloud-audio-source'
import { LocalAudioSource } from './local-audio-source'

export type { AudioSource, TrackMetadata, PlaybackSource } from './types'

export function createAudioSource(round: SongRound): AudioSource {
  return round.source === 'soundcloud' ? new SoundCloudAudioSource(round) : new LocalAudioSource(round)
}
