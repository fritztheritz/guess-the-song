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
      const startPlayback = () => {
        audio.play().catch(reject)
        this.stopTimer = setTimeout(() => {
          this.stop()
          resolve()
        }, duration * 1000)
      }

      const seekTo = (time: number) => {
        // Chrome/Firefox report duration (and therefore the seekable range) as Infinity for
        // a freshly-loaded blob: MP3 — our clips are always fetched into a blob first (see
        // soundcloud-playback.ts) rather than streamed — until a seek has touched the real
        // end of the file once. Before that, setting currentTime to anything is a silent
        // no-op: no 'seeked' event ever fires, so the clip just plays nothing forever. The
        // standard workaround is to seek near the end once, wait for the browser to resolve
        // the real duration (surfaced as a 'durationchange'/'timeupdate'), then seek again.
        if (audio.duration === Infinity || Number.isNaN(audio.duration)) {
          const onFixed = () => {
            audio.removeEventListener('timeupdate', onFixed)
            audio.addEventListener('seeked', startPlayback, { once: true })
            audio.currentTime = time
          }
          audio.addEventListener('timeupdate', onFixed, { once: true })
          audio.currentTime = 1e101
          return
        }
        audio.addEventListener('seeked', startPlayback, { once: true })
        audio.currentTime = time
      }

      const onCanPlay = () => {
        if (startTime <= 0) {
          // Seeking to 0 when currentTime is already 0 is a no-op — some browsers never
          // fire 'seeked' for it, so waiting on that event here would hang forever.
          startPlayback()
          return
        }
        // Setting currentTime kicks off an async seek; calling play() before it resolves
        // raced the seek and either silently played from wherever the seek hadn't reached
        // yet, or didn't play at all — this was the original bug for a non-zero start time.
        seekTo(startTime)
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
