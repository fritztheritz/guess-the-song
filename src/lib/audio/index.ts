import type { SongRound } from '../../types'
import type { AudioSource } from './types'
import { SoundCloudAudioSource } from './soundcloud-audio-source'
import { SpotifyAudioSource } from './spotify-audio-source'
import { LocalAudioSource } from './local-audio-source'

export type { AudioSource, TrackMetadata, PlaybackSource } from './types'

export function createAudioSource(round: SongRound): AudioSource {
  if (round.source === 'soundcloud') return new SoundCloudAudioSource(round)
  if (round.source === 'spotify') return new SpotifyAudioSource(round)
  return new LocalAudioSource(round)
}
