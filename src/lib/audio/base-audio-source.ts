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
      let started = false
      let watchdog: ReturnType<typeof setTimeout> | null = null

      // Two earlier attempts at this same bug both gated playback on some seek-related event
      // (canplay, seeked, durationchange) that turned out not to fire reliably for every
      // browser/track combination — leaving playback hung forever with no sound and no
      // error. Rather than chase the exact event sequence a third time, a watchdog guarantees
      // we start SOMETHING audible within 1.5s no matter which event never shows up: correct
      // position if the seek did land in time, current position otherwise. Silence is worse
      // than an occasionally-late seek.
      const startPlayback = () => {
        if (started) return
        started = true
        if (watchdog) clearTimeout(watchdog)
        audio.play().catch(reject)
        this.stopTimer = setTimeout(() => {
          this.stop()
          resolve()
        }, duration * 1000)
      }

      watchdog = setTimeout(startPlayback, 1500)

      const seekTo = (time: number) => {
        // Chrome/Firefox report duration (and therefore the seekable range) as Infinity for
        // a freshly-loaded blob: MP3 — our clips are always fetched into a blob first (see
        // soundcloud-playback.ts) rather than streamed — until a seek has touched the real
        // end of the file once. Before that, setting currentTime to anything is a silent
        // no-op: no 'seeked' event ever fires. The standard workaround is to seek near the
        // end once, wait for the browser to resolve the real duration, then seek again — but
        // the watchdog above is what actually guarantees we don't hang if even this doesn't
        // pan out for a given track/browser.
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
        seekTo(startTime)
      }
      audio.addEventListener('canplay', onCanPlay, { once: true })
      audio.addEventListener(
        'error',
        () => {
          if (watchdog) clearTimeout(watchdog)
          const code = audio.error?.code
          const detail = code ? ` (media error code ${code})` : ''
          reject(new Error(`Playback failed for this clip${detail}.`))
        },
        { once: true },
      )
      // SoundCloud caps some tracks (access: 'preview') to ~30s of actual audio data
      // regardless of the track's real length — a clip whose start+duration runs past that
      // has no more bytes to play at all, so the element fires 'ended' on its own well before
      // our duration timer would. Resolving here keeps caller-visible state (e.g. a shot
      // clock) from carrying on for a stretch that's already silent.
      audio.addEventListener(
        'ended',
        () => {
          if (!started) return
          this.stop()
          resolve()
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
