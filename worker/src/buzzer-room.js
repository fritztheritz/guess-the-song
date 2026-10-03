// One BuzzerRoom Durable Object instance per room code (Durable Objects are routed by
// name, so every WebSocket for the same code — the host and every player's phone — lands
// on the exact same instance, giving a consistent view of "who buzzed first" without any
// external pub/sub). State is plain in-memory fields on the class, not `ctx.storage` or the
// hibernatable-WebSocket API: a buzzer room only matters for the length of one hosting
// session (a couple of hours at most), traffic is frequent enough while it's in use that
// the instance stays warm, and losing the room if it's ever evicted mid-game just means
// the host's room code page reconnects and re-syncs teams — not worth the complexity of
// persisting/rehydrating state for what's inherently disposable, session-scoped data.

const MAX_ORDER = 20 // plenty for "who buzzed 2nd/3rd", caps memory for a long game

export class BuzzerRoom {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.hostSocket = null
    this.teams = []
    /** Every connected player socket, joined or not — broadcasts (teams/state/round) go to
     *  all of them, since a phone still on the name/team picker should still see live game
     *  info. `players` below is the smaller, joined-only subset with name/team identity. */
    this.playerSockets = new Set()
    /** @type {Map<WebSocket, {connId: string, name: string, teamId: string}>} */
    this.players = new Map()
    this.buzzState = 'closed' // 'closed' | 'open' | 'locked'
    this.winner = null
    this.order = []
    /** When the current clue's buzzer window opened — the baseline every buzz's
     *  reactionMs is measured from. Deliberately NOT reset by 'wrong' (only by 'open'):
     *  reaction time is "how fast from when guessing started", which should keep counting
     *  across a wrong-then-reopened round within the same clue, not restart per attempt. */
    this.openedAt = null
    /** Team ids the host has marked wrong for the current clue, blocked from re-buzzing —
     *  but only until every other team has also had (and missed) a turn. The point is
     *  "let someone else try first", not "you're out for the rest of this clue": once the
     *  ice would cover every team, it clears instead, so the race opens back up rather
     *  than staying locked until the next possession. */
    this.iced = new Set()
    /** Latest phone-safe round summary (see PhoneRoundState in protocol.ts) — relayed to
     *  players as-is; the Worker never inspects its contents, just carries it. */
    this.roundState = null
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }
    const url = new URL(request.url)
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'player'

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()

    if (role === 'host') {
      this.attachHost(server)
    } else {
      this.attachPlayer(server)
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  stateMessage() {
    return { type: 'state', buzzState: this.buzzState, winner: this.winner, order: this.order, iced: [...this.iced] }
  }

  attachHost(socket) {
    // Only one host expected at a time — a page refresh/reconnect just replaces it.
    this.hostSocket = socket
    this.send(socket, this.stateMessage())
    this.send(socket, { type: 'roster', players: this.rosterList() })

    socket.addEventListener('message', (event) => this.onHostMessage(event))
    socket.addEventListener('close', () => {
      if (this.hostSocket === socket) this.hostSocket = null
    })
    socket.addEventListener('error', () => {
      if (this.hostSocket === socket) this.hostSocket = null
    })
  }

  attachPlayer(socket) {
    this.playerSockets.add(socket)
    this.send(socket, { type: 'teams', teams: this.teams })
    this.send(socket, this.stateMessage())
    if (this.roundState) this.send(socket, { type: 'round', state: this.roundState })

    socket.addEventListener('message', (event) => this.onPlayerMessage(socket, event))
    socket.addEventListener('close', () => this.removePlayer(socket))
    socket.addEventListener('error', () => this.removePlayer(socket))
  }

  onHostMessage(event) {
    let msg
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    if (msg.type === 'sync-teams' && Array.isArray(msg.teams)) {
      this.teams = msg.teams
      this.broadcastToPlayers({ type: 'teams', teams: this.teams })
    } else if (msg.type === 'sync-round' && msg.state) {
      this.roundState = msg.state
      this.broadcastToPlayers({ type: 'round', state: this.roundState })
    } else if (msg.type === 'open') {
      this.buzzState = 'open'
      this.winner = null
      this.order = []
      // Power-Ups' Freeze: a frozen team starts this clue already iced, same as if they'd
      // already buzzed and missed — they can still get a turn once every other team has too
      // (the existing all-iced-clears-the-set rule in the 'wrong' branch below applies here
      // exactly the same way once this seed is in place).
      this.iced = Array.isArray(msg.frozenTeamIds) ? new Set(msg.frozenTeamIds) : new Set()
      this.openedAt = Date.now()
      this.broadcastAll(this.stateMessage())
    } else if (msg.type === 'close') {
      this.buzzState = 'closed'
      this.broadcastAll(this.stateMessage())
    } else if (msg.type === 'wrong' && typeof msg.teamId === 'string') {
      // The host judged the team that just buzzed as wrong: ice them out and reopen for
      // everyone else, without touching the winner history (order) already recorded. Once
      // every team on the roster has been iced this way, the ice clears instead of leaving
      // no one able to buzz — that means everyone's had (and missed) a turn, so it's a
      // fresh round for this same clue rather than a dead end until the next possession.
      this.iced.add(msg.teamId)
      if (this.teams.length > 0 && this.iced.size >= this.teams.length) {
        this.iced = new Set()
      }
      this.winner = null
      this.buzzState = 'open'
      this.broadcastAll(this.stateMessage())
    } else if (msg.type === 'eject' && typeof msg.teamId === 'string') {
      // Host gag: ice the team for the rest of this possession (the next 'open' clears it).
      // Only reopens the race if the ejected team was the one holding the lock — otherwise a
      // bystander's ejection would wipe out some other team's legitimate buzz-in.
      this.iced.add(msg.teamId)
      if (this.teams.length > 0 && this.iced.size >= this.teams.length) {
        this.iced = new Set()
      }
      if (this.winner?.teamId === msg.teamId) {
        this.winner = null
        this.buzzState = 'open'
      }
      this.broadcastAll(this.stateMessage())
    }
  }

  onPlayerMessage(socket, event) {
    let msg
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    // teamId: null joins as a spectator ("just watching") — everything else about a
    // spectator's connection (roster entry, message handling below) is identical to a real
    // player's, they just never have a real team id to buzz/score against.
    if (msg.type === 'join' && typeof msg.name === 'string' && (typeof msg.teamId === 'string' || msg.teamId === null)) {
      const existing = this.players.get(socket)
      const connId = existing?.connId ?? crypto.randomUUID()
      this.players.set(socket, { connId, name: msg.name.slice(0, 40), teamId: msg.teamId })
      this.send(socket, { type: 'joined', connId })
      this.broadcastToHost({ type: 'roster', players: this.rosterList() })
    } else if (msg.type === 'buzz') {
      const player = this.players.get(socket)
      // A spectator (teamId: null) has nothing to buzz in for — without this check they'd
      // fall through (iced.has(null) is always false) and could jump into the buzz race.
      if (!player || player.teamId === null || this.buzzState !== 'open' || this.iced.has(player.teamId)) return
      const now = Date.now()
      const entry = {
        connId: player.connId,
        name: player.name,
        teamId: player.teamId,
        at: now,
        reactionMs: this.openedAt ? now - this.openedAt : null,
      }
      this.order.push(entry)
      if (this.order.length > MAX_ORDER) this.order.shift()
      if (!this.winner) {
        this.winner = entry
        this.buzzState = 'locked'
      }
      this.broadcastAll(this.stateMessage())
    } else if (msg.type === 'guess' && typeof msg.text === 'string') {
      // Host-only, never broadcast to other players — same "don't leak more than the
      // current phase allows" discipline as roundState. Two cases:
      //  - 'locked': only the team that's actually locked in the buzzer can submit one, so
      //    a guess can't be spoofed for someone else's turn (Song/Lyric's buzz-then-type flow).
      //  - 'open': anyone can submit, no winner required — Guess the Year isn't a race, every
      //    connected player gets an independent shot and the host scores each one on its own.
      const player = this.players.get(socket)
      if (!player) return
      const allowed = this.buzzState === 'open' || (this.buzzState === 'locked' && this.winner?.connId === player.connId)
      if (!allowed) return
      this.broadcastToHost({ type: 'guess', connId: player.connId, text: msg.text.slice(0, 200) })
    }
  }

  removePlayer(socket) {
    this.playerSockets.delete(socket)
    if (this.players.delete(socket)) {
      this.broadcastToHost({ type: 'roster', players: this.rosterList() })
    }
  }

  rosterList() {
    return [...this.players.values()]
  }

  send(socket, msg) {
    try {
      socket.send(JSON.stringify(msg))
    } catch {
      // Socket already closed — its close/error listener will clean it up.
    }
  }

  broadcastToHost(msg) {
    if (this.hostSocket) this.send(this.hostSocket, msg)
  }

  broadcastToPlayers(msg) {
    for (const socket of this.playerSockets) this.send(socket, msg)
  }

  broadcastAll(msg) {
    this.broadcastToHost(msg)
    this.broadcastToPlayers(msg)
  }
}
