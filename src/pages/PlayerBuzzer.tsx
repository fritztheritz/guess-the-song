import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BuzzerSocket } from '../lib/buzzer/buzzer-socket'
import type { BuzzState, BuzzerTeam, BuzzerWinner, PhoneRoundState } from '../lib/buzzer/protocol'

const MODE_CLUE_LABEL: Record<PhoneRoundState['mode'], string> = {
  song: '🎧 Listen up!',
  year: '📅 What year is it from?',
  tierguess: '🎯 Guess the ranking!',
  lyric: '📝 Finish the lyric',
}

// Short labels for the month tap-grid (guessStage: 'guessMonth') — full names would wrap
// awkwardly at 3-per-row on a phone width.
const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
  const [iced, setIced] = useState<string[]>([])
  const [myConnId, setMyConnId] = useState<string | null>(null)
  const [roundState, setRoundState] = useState<PhoneRoundState | null>(null)
  const [guessInput, setGuessInput] = useState('')
  const [guessSent, setGuessSent] = useState(false)
  // Guess the Year / Guess the Tier: no-buzz free-for-all guessing, shared between the two
  // modes since they're the same shape (type an answer, right ones score automatically —
  // see HostController's autoScoreGuesses). Song/Lyric's buzz-then-type guess above is a
  // separate flow (guessInput/guessSent) since that one's still winner-gated.
  const [modeGuessInput, setModeGuessInput] = useState('')
  const [modeGuessSubmitted, setModeGuessSubmitted] = useState<string | null>(null)
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
        setIced(msg.iced)
      } else if (msg.type === 'joined') {
        setMyConnId(msg.connId)
        setConnected(true)
      } else if (msg.type === 'round') {
        setRoundState(msg.state)
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

  // A fresh buzzer window (a new clue, or reopened after a wrong judgment) always means
  // whatever was typed for the last one is stale.
  useEffect(() => {
    if (buzzState === 'open') {
      setGuessInput('')
      setGuessSent(false)
    }
  }, [buzzState])

  function handleGuessSubmit(e: FormEvent) {
    e.preventDefault()
    const text = guessInput.trim()
    if (!text) return
    socketRef.current?.send({ type: 'guess', text })
    setGuessSent(true)
  }

  // Neither mode is a race — every connected player can submit independently, and getting
  // it right scores automatically, so unlike the buzz-race guess above there's no "only the
  // winner" gate and no locking after one submission. A fresh round means whatever was typed
  // for the last one (right or wrong) is stale.
  useEffect(() => {
    setModeGuessInput('')
    setModeGuessSubmitted(null)
  }, [roundState?.possessionIndex, roundState?.guessStage])

  function submitModeGuess(text: string) {
    if (!text) return
    socketRef.current?.send({ type: 'guess', text })
    setModeGuessSubmitted(text)
    setModeGuessInput(text)
  }

  function handleModeGuessSubmit(e: FormEvent) {
    e.preventDefault()
    submitModeGuess(modeGuessInput.trim())
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
      <div className="mb-4 text-xs uppercase tracking-widest text-slate-500">Room {activeCode}</div>

      {/* Phone-only mode: a phone-safe mirror of what the host has on screen, so the room
          can play with no shared TV/laptop at all — visible even before joining/buzzing. */}
      {roundState && (
        <div className="mb-3 w-full max-w-xs rounded-xl border border-arena-700 bg-arena-800/60 p-3 text-left">
          <div className="mb-1 text-[11px] uppercase tracking-widest text-slate-500">
            {roundState.gameName}
            {roundState.phase === 'clue' || roundState.phase === 'revealed' ? (
              <> · Round {roundState.possessionIndex + 1}/{roundState.totalPossessions}</>
            ) : null}
          </div>
          {roundState.phase === 'clue' && (
            <div className="text-sm text-hardwood-300">
              {roundState.clueText ? `“${roundState.clueText}”` : MODE_CLUE_LABEL[roundState.mode]}
            </div>
          )}
          {roundState.phase === 'revealed' && roundState.revealed && (
            <div>
              <div className="font-semibold text-white">{roundState.revealed.title}</div>
              <div className="text-sm text-slate-400">{roundState.revealed.artist}</div>
              {roundState.revealed.lyricAnswer && (
                <div className="mt-1 text-sm italic text-hardwood-300">“{roundState.revealed.lyricAnswer}”</div>
              )}
            </div>
          )}
          {(roundState.phase === 'intro' || roundState.phase === 'resume') && (
            <div className="text-sm text-slate-400">Get ready…</div>
          )}
          {roundState.phase === 'halftime' && <div className="text-sm text-slate-300">🏀 Halftime — back soon</div>}
          {roundState.phase === 'final' && (
            <div className="text-sm text-slate-300">
              🏆 {[...roundState.teams].sort((a, b) => b.score - a.score)[0]?.name ?? '—'} wins!
            </div>
          )}
        </div>
      )}
      {roundState && roundState.teams.length > 0 && (
        <div className="mb-6 flex w-full max-w-xs flex-wrap justify-center gap-1.5">
          {[...roundState.teams]
            .sort((a, b) => b.score - a.score)
            .map((t) => (
              <span key={t.id} className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `${t.color}22`, color: t.color }}>
                {t.avatar ? `${t.avatar} ` : ''}{t.name} {t.score}
              </span>
            ))}
        </div>
      )}

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
                      {team.avatar ? `${team.avatar} ` : ''}
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
            {identity?.name} ·{' '}
            <span style={{ color: myTeam?.color }}>
              {myTeam?.avatar ? `${myTeam.avatar} ` : ''}
              {myTeam?.name ?? '…'}
            </span>
          </div>

          {roundState?.mode === 'year' || roundState?.mode === 'tierguess' ? (
            <div className="w-full max-w-xs space-y-3">
              {roundState.phase === 'clue' ? (
                <>
                  {/* Tap-to-guess: the tier list's own tier names (not which song is in
                      which one — that's still the actual guess) are safe to hand over as
                      one-tap buttons, faster and typo-proof compared to typing them. Free
                      text below still works for a tier list with more tiers than fit here,
                      or if you'd rather type. */}
                  {roundState.mode === 'tierguess' && roundState.tiers && roundState.tiers.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {roundState.tiers.map((tier) => (
                        <button
                          key={tier.name}
                          onClick={() => submitModeGuess(tier.name)}
                          className="truncate rounded-xl border-2 px-2 py-3 font-display text-lg font-semibold"
                          style={{
                            background: `${tier.color}22`,
                            color: tier.color,
                            borderColor: modeGuessSubmitted === tier.name ? tier.color : 'transparent',
                          }}
                        >
                          {modeGuessSubmitted === tier.name ? '✓ ' : ''}
                          {tier.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <form onSubmit={handleModeGuessSubmit} className="flex gap-2">
                    <input
                      value={modeGuessInput}
                      onChange={(e) => setModeGuessInput(e.target.value)}
                      placeholder={roundState.mode === 'year' ? 'Year, e.g. 2003' : 'Tier, e.g. S'}
                      autoFocus={roundState.mode === 'year'}
                      maxLength={roundState.mode === 'year' ? 4 : 40}
                      inputMode={roundState.mode === 'year' ? 'numeric' : 'text'}
                      pattern={roundState.mode === 'year' ? '[0-9]*' : undefined}
                      autoComplete="off"
                      autoCapitalize={roundState.mode === 'year' ? undefined : 'characters'}
                      autoCorrect={roundState.mode === 'year' ? undefined : 'off'}
                      spellCheck={false}
                      enterKeyHint="send"
                      className="w-full rounded-xl border border-arena-600 bg-arena-800 px-4 py-3 text-center font-display text-2xl tracking-widest text-white outline-none focus:border-hardwood-500"
                    />
                    <button
                      type="submit"
                      disabled={!modeGuessInput.trim()}
                      className="shrink-0 rounded-xl bg-hardwood-500 px-4 font-semibold text-arena-950 disabled:opacity-30 hover:bg-hardwood-400"
                    >
                      Send
                    </button>
                  </form>
                  {modeGuessSubmitted && (
                    <p className="text-sm text-slate-400">✓ Sent "{modeGuessSubmitted}" — change your mind? Just tap or type a new one.</p>
                  )}
                  <p className="text-xs text-slate-500">No need to buzz — everyone can guess, right answers score automatically.</p>
                </>
              ) : roundState.phase === 'revealed' && roundState.guessStage === 'guessPosition' ? (
                <>
                  <p className="text-sm text-slate-300">Which position in the tier?</p>
                  {/* A dropdown, not a button grid — unlike the tier list's tap buttons
                      above (always a handful of tiers), a tier can hold dozens of songs, and
                      a grid that big would just be clutter. A native <select> stays a single
                      tap either way (the OS's own picker/wheel scales fine to any count) —
                      same "trust the platform's own UI over an app-built one" call as the
                      guess-box's plain autoCorrect/spellCheck instead of a suggestion list. */}
                  {roundState.positionCount ? (
                    <select
                      value={modeGuessSubmitted ?? ''}
                      onChange={(e) => submitModeGuess(e.target.value)}
                      className="w-full rounded-xl border border-arena-600 bg-arena-800 px-4 py-3 text-center font-display text-xl text-white outline-none focus:border-hardwood-500"
                    >
                      <option value="" disabled>
                        Pick a position…
                      </option>
                      {Array.from({ length: roundState.positionCount }, (_, i) => String(i + 1)).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <form onSubmit={handleModeGuessSubmit} className="flex gap-2">
                    <input
                      value={modeGuessInput}
                      onChange={(e) => setModeGuessInput(e.target.value)}
                      placeholder="Position, e.g. 2"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      spellCheck={false}
                      enterKeyHint="send"
                      className="w-full rounded-xl border border-arena-600 bg-arena-800 px-4 py-3 text-center font-display text-2xl tracking-widest text-white outline-none focus:border-hardwood-500"
                    />
                    <button
                      type="submit"
                      disabled={!modeGuessInput.trim()}
                      className="shrink-0 rounded-xl bg-hardwood-500 px-4 font-semibold text-arena-950 disabled:opacity-30 hover:bg-hardwood-400"
                    >
                      Send
                    </button>
                  </form>
                  {modeGuessSubmitted && <p className="text-sm text-slate-400">✓ Sent "{modeGuessSubmitted}"</p>}
                </>
              ) : roundState.phase === 'revealed' && roundState.guessStage === 'guessMonth' ? (
                <>
                  <p className="text-sm text-slate-300">Which month?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {MONTH_SHORT_NAMES.map((m) => (
                      <button
                        key={m}
                        onClick={() => submitModeGuess(m)}
                        className="rounded-xl border-2 border-arena-600 bg-arena-800 px-2 py-3 font-display text-base font-semibold text-white"
                        style={{ borderColor: modeGuessSubmitted === m ? '#f59e0b' : undefined }}
                      >
                        {modeGuessSubmitted === m ? '✓ ' : ''}
                        {m}
                      </button>
                    ))}
                  </div>
                  {modeGuessSubmitted && <p className="text-sm text-slate-400">✓ Sent "{modeGuessSubmitted}"</p>}
                </>
              ) : (
                <p className="text-sm text-slate-400">⏳ Time's up — check the screen for the answer.</p>
              )}
            </div>
          ) : buzzState === 'locked' && winner ? (
            winner.connId === myConnId ? (
              <div className="flex w-full max-w-xs flex-col items-center gap-4">
                <div className="flex h-40 w-40 flex-col items-center justify-center rounded-full bg-scoreboard-green text-arena-950 shadow-2xl">
                  <div className="text-4xl">✅</div>
                  <div className="mt-1 font-display text-xl">YOU GOT IT!</div>
                </div>
                {/* Lets the host read the answer instead of everyone shouting across the
                    room — optional, host still judges correct/wrong same as always. Only
                    Song/Lyric actually show a judging banner host-side (see HostController's
                    markBuzzCorrect comment); on Tier Guess/Year a typed guess would just go
                    nowhere, so it's not offered there at all. */}
                {(roundState?.mode === 'song' || roundState?.mode === 'lyric') &&
                  (guessSent ? (
                    <p className="text-sm text-slate-400">Sent to the host — go ahead and say it too!</p>
                  ) : (
                    <form onSubmit={handleGuessSubmit} className="flex w-full gap-2">
                      <input
                        value={guessInput}
                        onChange={(e) => setGuessInput(e.target.value)}
                        placeholder="Type your answer for the host…"
                        autoFocus
                        maxLength={200}
                        // Leans entirely on the phone's own keyboard — predictive text/
                        // autocorrect/spellcheck all draw from the OS's dictionary and this
                        // player's own typing history, never from this app or the game's
                        // data, so there's no way for it to hint at what's actually in the
                        // song pool. autoComplete is explicitly off instead of on: browser
                        // form-autofill would surface a dropdown of past *whole answers*
                        // from other songs, which is just confusing noise for a one-off guess.
                        autoComplete="off"
                        autoCapitalize={roundState.mode === 'song' ? 'words' : 'sentences'}
                        autoCorrect="on"
                        spellCheck
                        enterKeyHint="send"
                        className="w-full rounded-xl border border-arena-600 bg-arena-800 px-3 py-2 text-sm text-white outline-none focus:border-hardwood-500"
                      />
                      <button
                        type="submit"
                        disabled={!guessInput.trim()}
                        className="shrink-0 rounded-xl bg-hardwood-500 px-4 py-2 text-sm font-semibold text-arena-950 disabled:opacity-30 hover:bg-hardwood-400"
                      >
                        Send
                      </button>
                    </form>
                  ))}
              </div>
            ) : (
              <div className="flex h-56 w-56 flex-col items-center justify-center rounded-full border-4 border-arena-600 bg-arena-800 text-slate-400">
                <div className="text-3xl">🔒</div>
                <div className="mt-1 px-4 text-sm">{winner.name} buzzed first</div>
              </div>
            )
          ) : identity && iced.includes(identity.teamId) ? (
            <div className="flex h-56 w-56 flex-col items-center justify-center rounded-full border-4 border-arena-700 bg-arena-800 text-slate-500">
              <div className="text-3xl">🚫</div>
              <div className="mt-1 px-6 text-sm">Your team already tried this one — sit tight</div>
            </div>
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
