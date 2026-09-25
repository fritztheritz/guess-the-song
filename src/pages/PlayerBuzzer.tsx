import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BuzzerSocket } from '../lib/buzzer/buzzer-socket'
import type { BuzzState, BuzzerTeam, BuzzerWinner } from '../lib/buzzer/protocol'

function storageKey(code: string) {
  return `gts.buzzer.player.${code.toUpperCase()}`
}

interface SavedIdentity {
  name: string
  teamId: string
}

function loadIdentity(code: string): SavedIdentity | null {
  try {
    const raw = sessionStorage.getItem(storageKey(code))
    return raw ? (JSON.parse(raw) as SavedIdentity) : null
  } catch {
    return null
  }
}

function saveIdentity(code: string, identity: SavedIdentity) {
  try {
    sessionStorage.setItem(storageKey(code), JSON.stringify(identity))
  } catch {
    // Session storage unavailable — just means a reload asks for name/team again, non-fatal.
  }
}

// The phone-side half of Phone Buzz-In: a player visits /buzz/<code> (typed in or scanned
// from the QR the host's screen shows), names themselves, picks a team, and gets one big
// button. No game data lives here at all — team names/colors and buzz state both come
// entirely from the BuzzerRoom over the socket, so this page works without ever touching
// this app's localStorage-based game library.
export default function PlayerBuzzer() {
  const params = useParams<{ code?: string }>()
  const navigate = useNavigate()
  const [codeInput, setCodeInput] = useState(params.code?.toUpperCase() ?? '')
  const [connected, setConnected] = useState(false)
  const [teams, setTeams] = useState<BuzzerTeam[]>([])
  const [identity, setIdentity] = useState<SavedIdentity | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [buzzState, setBuzzState] = useState<BuzzState>('closed')
  const [winner, setWinner] = useState<BuzzerWinner | null>(null)
  const [myConnId, setMyConnId] = useState<string | null>(null)
  const socketRef = useRef<BuzzerSocket | null>(null)

  const activeCode = params.code?.toUpperCase() ?? null

  useEffect(() => {
    if (!activeCode) return
    const saved = loadIdentity(activeCode)
    if (saved) {
      setIdentity(saved)
      setNameInput(saved.name)
      setSelectedTeamId(saved.teamId)
    }

    const socket = new BuzzerSocket(activeCode, 'player')
    socketRef.current = socket
    const unsubscribe = socket.onMessage((msg) => {
      if (msg.type === 'teams') setTeams(msg.teams)
      else if (msg.type === 'state') {
        setBuzzState(msg.buzzState)
        setWinner(msg.winner)
      } else if (msg.type === 'joined') {
        setMyConnId(msg.connId)
        setConnected(true)
      }
    })
    socket.connect()

    if (saved) socket.sendAndRemember({ type: 'join', name: saved.name, teamId: saved.teamId })

    return () => {
      unsubscribe()
      socket.close()
      socketRef.current = null
    }
  }, [activeCode])

  function handleCodeSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = codeInput.trim().toUpperCase()
    if (trimmed) navigate(`/buzz/${trimmed}`)
  }

  function handleJoin() {
    if (!activeCode || !nameInput.trim() || !selectedTeamId) return
    const saved: SavedIdentity = { name: nameInput.trim(), teamId: selectedTeamId }
    setIdentity(saved)
    saveIdentity(activeCode, saved)
    socketRef.current?.sendAndRemember({ type: 'join', name: saved.name, teamId: saved.teamId })
  }

  function handleBuzz() {
    socketRef.current?.send({ type: 'buzz' })
  }

  if (!activeCode) {
    return (
      <div className="flex min-h-svh items-center justify-center court-lines px-6">
        <form onSubmit={handleCodeSubmit} className="w-full max-w-xs space-y-4 text-center">
          <div className="text-5xl">🔔</div>
          <h1 className="font-display text-2xl tracking-wide text-white">JOIN A GAME</h1>
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            autoFocus
            maxLength={8}
            className="w-full rounded-xl border border-arena-600 bg-arena-800 px-4 py-3 text-center font-display text-2xl tracking-[0.3em] text-white outline-none focus:border-hardwood-500"
          />
          <button type="submit" className="w-full rounded-full bg-hardwood-500 py-3 font-semibold text-arena-950 hover:bg-hardwood-400">
            JOIN
          </button>
        </form>
      </div>
    )
  }

  const myTeam = teams.find((t) => t.id === identity?.teamId)

  return (
    <div className="flex min-h-svh flex-col items-center justify-center court-lines px-6 py-10 text-center">
      <div className="mb-6 text-xs uppercase tracking-widest text-slate-500">Room {activeCode}</div>

      {!connected && !identity ? (
        <div className="w-full max-w-xs">
          {!connected && teams.length === 0 ? (
            <p className="text-sm text-slate-400">Connecting…</p>
          ) : (
            <div className="space-y-4">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Your name"
                autoFocus
                maxLength={40}
                className="w-full rounded-xl border border-arena-600 bg-arena-800 px-4 py-3 text-center text-lg text-white outline-none focus:border-hardwood-500"
              />
              <div>
                <div className="mb-2 text-sm text-slate-400">Pick your team</div>
                <div className="grid grid-cols-2 gap-2">
                  {teams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeamId(team.id)}
                      className={`rounded-xl border-2 px-3 py-3 font-semibold ${
                        selectedTeamId === team.id ? 'border-white' : 'border-transparent'
                      }`}
                      style={{ background: `${team.color}22`, color: team.color, borderColor: selectedTeamId === team.id ? team.color : 'transparent' }}
                    >
                      {team.name}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleJoin}
                disabled={!nameInput.trim() || !selectedTeamId}
                className="w-full rounded-full bg-hardwood-500 py-3 font-semibold text-arena-950 disabled:opacity-30 hover:bg-hardwood-400"
              >
                READY
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex w-full max-w-xs flex-col items-center gap-4">
          <div className="text-sm text-slate-400">
            {identity?.name} · <span style={{ color: myTeam?.color }}>{myTeam?.name ?? '…'}</span>
          </div>

          {buzzState === 'locked' && winner ? (
            winner.connId === myConnId ? (
              <div className="flex h-56 w-56 flex-col items-center justify-center rounded-full bg-scoreboard-green text-arena-950 shadow-2xl">
                <div className="text-4xl">✅</div>
                <div className="mt-1 font-display text-xl">YOU GOT IT!</div>
              </div>
            ) : (
              <div className="flex h-56 w-56 flex-col items-center justify-center rounded-full border-4 border-arena-600 bg-arena-800 text-slate-400">
                <div className="text-3xl">🔒</div>
                <div className="mt-1 px-4 text-sm">{winner.name} buzzed first</div>
              </div>
            )
          ) : (
            <button
              onClick={handleBuzz}
              disabled={buzzState !== 'open'}
              className="flex h-56 w-56 flex-col items-center justify-center rounded-full bg-scoreboard-500 text-3xl font-display tracking-wide text-white shadow-2xl transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-arena-700 disabled:text-slate-500"
            >
              {buzzState === 'open' ? 'BUZZ!' : 'WAIT…'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
