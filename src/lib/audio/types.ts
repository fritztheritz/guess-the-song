export interface TrackMetadata {
  title: string
  artist: string
  artworkUrl?: string
  duration?: number
}

export interface PlaybackSource {
  url: string
  kind: 'soundcloud' | 'local'
}

/**
 * Abstraction the game engine plays against, independent of where the audio
 * comes from (spec §8). SoundCloudAudioSource is the primary implementation;
 * LocalAudioSource exists for dev/testing without a SoundCloud connection.
 */
export interface AudioSource {
  getMetadata(): Promise<TrackMetadata>
  getPlaybackSource(): Promise<PlaybackSource>
  /** Plays [startTime, startTime + duration) seconds, resolving when the clip finishes or is stopped. */
  play(startTime: number, duration: number): Promise<void>
  stop(): void
}
