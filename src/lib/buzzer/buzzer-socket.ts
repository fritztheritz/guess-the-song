import { buzzerSocketUrl } from './config'
import type { HostOutMessage, PlayerOutMessage, ServerMessage } from './protocol'

type OutMessage = HostOutMessage | PlayerOutMessage

// Phones lock their screens mid-game and mobile browsers suspend/drop the socket when
// backgrounded — a buzzer that can't recover from that is unusable in practice, so this
// wraps the raw WebSocket with auto-reconnect (backoff, capped) and a "replay on
// reconnect" hook so a player's `join` message gets resent automatically rather than
// leaving them connected-but-not-in-the-roster after their phone comes back.
export class BuzzerSocket {
  private ws: WebSocket | null = null
  private closedByUser = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private handlers = new Set<(msg: ServerMessage) => void>()
  private replayOnReconnect: OutMessage[] = []
  private code: string
  private role: 'host' | 'player'

  constructor(code: string, role: 'host' | 'player') {
    this.code = code
    this.role = role
  }

  connect() {
    this.closedByUser = false
    const ws = new WebSocket(buzzerSocketUrl(this.code, this.role))
    this.ws = ws

    ws.addEventListener('open', () => {
      this.reconnectDelay = 1000
      for (const msg of this.replayOnReconnect) this.send(msg)
    })
    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage
        this.handlers.forEach((h) => h(msg))
      } catch {
        // Malformed frame — ignore rather than crash the whole connection over one message.
      }
    })
    ws.addEventListener('close', () => this.scheduleReconnect())
    ws.addEventListener('error', () => ws.close())

    if (typeof document !== 'undefined' && !this.visibilityListenerAttached) {
      this.visibilityListenerAttached = true
      document.addEventListener('visibilitychange', this.onVisibilityChange)
    }
  }

  private visibilityListenerAttached = false
  private onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && this.ws?.readyState !== WebSocket.OPEN && !this.closedByUser) {
      this.connect()
    }
  }

  private scheduleReconnect() {
    if (this.closedByUser || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.closedByUser) this.connect()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 5000)
  }

  /** Sent again automatically on every reconnect — used for the player's `join` so a
   *  phone waking back up rejoins the roster without the person having to do anything. */
  sendAndRemember(msg: OutMessage) {
    this.replayOnReconnect = this.replayOnReconnect.filter((m) => m.type !== msg.type)
    this.replayOnReconnect.push(msg)
    this.send(msg)
  }

  send(msg: OutMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  onMessage(handler: (msg: ServerMessage) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  close() {
    this.closedByUser = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.visibilityListenerAttached) document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.ws?.close()
    this.ws = null
  }
}
