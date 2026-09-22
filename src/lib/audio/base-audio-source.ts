import type { AudioSource, PlaybackSource } from './types'

/** Shared HTMLAudioElement clip-playing logic. Subclasses only resolve the URL. */
export abstract class BaseAudioSource implements AudioSource {
  private audio: HTMLAudioElement | null = null
  private stopTimer: ReturnType<typeof setTimeout> | null = null

  abstract getMetadata(): ReturnType<AudioSource['getMetadata']>
  abstract getPlaybackSource(): Promise<PlaybackSource>

  async play(startTime: number, duration: number): Promise<void> {
    this.stop()

    const source = await this.getPlaybackSource()
    const audio = new Audio(source.url)
    audio.preload = 'auto'
    // No crossOrigin attribute: SoundCloud's signed stream URLs aren't CORS-enabled, and
    // setting crossOrigin='anonymous' makes the browser enforce CORS on the media load,
    // rejecting an otherwise-playable URL. Plain <audio> playback doesn't need CORS at all.
    this.audio = audio

    return new Promise((resolve, reject) => {
      const onCanPlay = () => {
        audio.currentTime = startTime
        audio.play().catch(reject)
        this.stopTimer = setTimeout(() => {
          this.stop()
          resolve()
        }, duration * 1000)
      }
      audio.addEventListener('canplay', onCanPlay, { once: true })
      audio.addEventListener(
        'error',
        () => {
          const code = audio.error?.code
          const detail = code ? ` (media error code ${code})` : ''
          reject(new Error(`Playback failed for this clip${detail}.`))
        },
        { once: true },
      )
    })
  }

  stop(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
    if (this.audio) {
      this.audio.pause()
      this.audio.src = ''
      this.audio = null
    }
  }
}
