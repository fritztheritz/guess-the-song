// Minimal ambient types for the Web Playback SDK (loaded at runtime from
// https://sdk.scdn.co/spotify-player.js, not an npm package) — only the surface
// spotify-player.ts actually uses, not the full SDK.
export {}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void
    Spotify?: {
      Player: new (options: {
        name: string
        getOAuthToken: (callback: (token: string) => void) => void
        volume?: number
      }) => SpotifyPlayerInstance
    }
  }

  interface SpotifyPlayerInstance {
    connect(): Promise<boolean>
    disconnect(): void
    pause(): Promise<void>
    resume(): Promise<void>
    seek(positionMs: number): Promise<void>
    addListener(event: 'ready' | 'not_ready', callback: (data: { device_id: string }) => void): boolean
    addListener(
      event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error',
      callback: (data: { message: string }) => void,
    ): boolean
    addListener(event: 'player_state_changed', callback: (state: unknown) => void): boolean
  }
}
