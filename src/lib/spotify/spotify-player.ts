import { getValidConnection } from './spotify-auth'
import { SPOTIFY_API_BASE } from './config'

// Unlike SoundCloudAudioSource/LocalAudioSource (a fresh <audio> element per play() call),
// Spotify playback goes through ONE heavyweight, page-lifetime Player object connected to
// Spotify's own infrastructure — creating a new one per clip would be wrong (and slow).
// This is a lazily-created module-level singleton, wrapped by SpotifyAudioSource so the
// rest of the app still only ever sees the plain AudioSource interface.
class SpotifyPlayerManager {
  private player: SpotifyPlayerInstance | null = null
  private deviceId: string | null = null
  private readyPromise: Promise<string> | null = null
  private stopTimer: ReturnType<typeof setTimeout> | null = null
  private sdkLoadPromise: Promise<void> | null = null

  private loadSdk(): Promise<void> {
    if (window.Spotify) return Promise.resolve()
    if (this.sdkLoadPromise) return this.sdkLoadPromise
    this.sdkLoadPromise = new Promise((resolve) => {
      window.onSpotifyWebPlaybackSDKReady = () => resolve()
      const script = document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      document.body.appendChild(script)
    })
    return this.sdkLoadPromise
  }

  /** Resolves once a Player is connected and has a device_id ready to receive playback. */
  private ensureReady(): Promise<string> {
    if (this.deviceId) return Promise.resolve(this.deviceId)
    if (this.readyPromise) return this.readyPromise

    this.readyPromise = (async () => {
      await this.loadSdk()
      if (!window.Spotify) throw new Error('Spotify playback SDK failed to load.')

      const player = new window.Spotify.Player({
        name: 'Guess the Track',
        getOAuthToken: (callback) => {
          getValidConnection()
            .then((c) => callback(c.accessToken))
            .catch(() => callback(''))
        },
        volume: 1,
      })
      this.player = player

      const deviceId = await new Promise<string>((resolve, reject) => {
        player.addListener('ready', ({ device_id }) => resolve(device_id))
        player.addListener('initialization_error', ({ message }) => reject(new Error(message)))
        player.addListener('authentication_error', ({ message }) => reject(new Error(message)))
        player.addListener('account_error', ({ message }) => reject(new Error(`Spotify Premium is required for playback: ${message}`)))
      })

      const connected = await player.connect()
      if (!connected) throw new Error('Could not connect to Spotify for playback.')
      this.deviceId = deviceId
      return deviceId
    })()

    return this.readyPromise
  }

  /** Plays [startMs, startMs + durationMs) of `uri`, resolving when the clip ends or is stopped. */
  async playClip(uri: string, startMs: number, durationMs: number): Promise<void> {
    this.clearStopTimer()
    const deviceId = await this.ensureReady()

    // The device can take a beat to finish registering with Spotify Connect after the SDK
    // reports it `ready` — calling play immediately after connecting sometimes 404s
    // ("Device not found") even though the same call succeeds moments later. Retry a couple
    // of times before giving up.
    const attempts = [0, 400, 900]
    let lastError: Error | null = null
    for (const delay of attempts) {
      if (delay) await new Promise((r) => setTimeout(r, delay))
      const connection = await getValidConnection()
      const response = await fetch(`${SPOTIFY_API_BASE}/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${connection.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [uri], position_ms: startMs }),
      })

      // 204 No Content is the documented success response.
      if (response.ok || response.status === 204) {
        lastError = null
        break
      }

      const detail = await response.text().catch(() => '')
      const hint = response.status === 403 ? ' Spotify Premium is required for playback.' : ''
      lastError = new Error(`Spotify playback failed (${response.status}).${hint} ${detail}`.trim())
      if (response.status !== 404) break // only the "device not registered yet" case is worth retrying
    }
    if (lastError) throw lastError

    return new Promise((resolve) => {
      this.stopTimer = setTimeout(() => {
        this.player?.pause().catch(() => {})
        resolve()
      }, durationMs)
    })
  }

  private clearStopTimer() {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
  }

  stop(): void {
    this.clearStopTimer()
    this.player?.pause().catch(() => {})
  }
}

let manager: SpotifyPlayerManager | null = null

export function getSpotifyPlayerManager(): SpotifyPlayerManager {
  if (!manager) manager = new SpotifyPlayerManager()
  return manager
}
