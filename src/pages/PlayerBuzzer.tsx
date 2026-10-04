import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BuzzerSocket, type SocketStatus } from '../lib/buzzer/buzzer-socket'
import ConnectionBanner from '../components/ConnectionBanner'
import type { BuzzState, BuzzerTeam, BuzzerWinner, PhoneRoundState } from '../lib/buzzer/protocol'
import PopularityPicker from '../components/PopularityPicker'
import DraftBallot from '../components/DraftBallot'
import { useFeatureFlag } from '../state/feature-flags-context'
import { applyThemeVars } from '../lib/themes'
import { isSoundMuted, playBuzzIn, playEject, playWrong, setSoundMuted, unlockAudio } from '../lib/sound-effects'

const MODE_CLUE_LABEL: Record<PhoneRoundState['mode'], string> = {
  song: '🎧 Listen up!',
  year: '📅 What year is it from?',
  tierguess: '🎯 Guess the ranking!',
  lyric: '📝 Finish the lyric',
  popularity: '📈 Guess the popularity rank',
  draft: '🏀 Draft night',
}

// Short labels for the month tap-grid (guessStage: 'guessMonth') — full names would wrap
// awkwardly at 3-per-row on a phone width.
const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// UI-only sentinel for the join picker's `selectedTeamId` — distinguishes "explicitly chose
// to just watch" from "hasn't picked anything yet" (both would otherwise be `null`, which is
// the real spectator value sent to the room). Never leaves this component.
const SPECTATOR_CHOICE = '__spectator__'

// A guess going through is the one thing a player must be sure of — a big green banner, not a
// grey footnote. (The status pill above carries how many teams are in.)
function SentBanner({ text, hint }: { text: string; hint?: string }) {
  return (
    <div role="status" className="rounded-xl border-2 border-scoreboard-green bg-scoreboard-green/15 px-4 py-3 text-scoreboard-green">
      <div className="font-display text-xl tracking-wide">✓ SENT: {text}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  )
}

const STATUS_TONE = {
  go: 'border-scoreboard-green/60 bg-scoreboard-green/15 text-scoreboard-green',
  stop: 'border-scoreboard-500/60 bg-scoreboard-500/15 text-scoreboard-500',
  wait: 'border-arena-600 bg-arena-800 text-slate-300',
} as const

function storageKey(code: string) {
  return `gts.buzzer.player.${code.toUpperCase()}`
}

interface SavedIdentity {
  name: string
  /** null = joined as a spectator ("just watching") — see BuzzerPlayer in protocol.ts. */
  teamId: string | null
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
  const { code } = useParams<{ code?: string }>()
  // Keyed on the code so joining a different room remounts with that room's saved identity
  // (read once, below, as initial state) instead of carrying the last room's over.
  return <PlayerBuzzerRoom key={code ?? ''} activeCode={code?.toUpperCase() ?? null} />
}

function PlayerBuzzerRoom({ activeCode }: { activeCode: string | null }) {
  const navigate = useNavigate()
  const spectatorModeEnabled = useFeatureFlag('spectator-mode')
  const [saved] = useState(() => (activeCode ? loadIdentity(activeCode) : null))
  const [codeInput, setCodeInput] = useState(activeCode ?? '')
  const [connected, setConnected] = useState(false)
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting')
  const [teams, setTeams] = useState<BuzzerTeam[]>([])
  const [identity, setIdentity] = useState<SavedIdentity | null>(saved)
  const [nameInput, setNameInput] = useState(saved?.name ?? '')
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    saved && saved.teamId === null ? SPECTATOR_CHOICE : (saved?.teamId ?? null),
  )
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

  useEffect(() => {
    if (!activeCode) return

    const socket = new BuzzerSocket(activeCode, 'player')
    socketRef.current = socket
    const unsubscribeStatus = socket.onStatus(setSocketStatus)
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
      unsubscribeStatus()
      socket.close()
      socketRef.current = null
    }
  }, [activeCode, saved])

  // Match the host's venue skin whenever it's part of the round state (not persisted — a
  // guest's own device keeps its own setting).
  const hostTheme = roundState?.theme
  useEffect(() => {
    if (hostTheme) applyThemeVars(hostTheme)
  }, [hostTheme])

  // Haptic + sound cues for the moments a phone-in-hand player shouldn't have to be staring at
  // the screen for: you won the buzz, you got locked/ejected out, a window just opened. Sounds
  // follow the shared mute setting (see the toggle below).
  const iAmIced = !!identity?.teamId && iced.includes(identity.teamId)
  const iWon = buzzState === 'locked' && !!winner && winner.connId === myConnId
  const cue = iWon ? 'won' : iAmIced ? 'iced' : buzzState === 'open' && identity?.teamId ? 'open' : 'idle'
  const guessMode = roundState?.mode === 'year' || roundState?.mode === 'tierguess'
  useEffect(() => {
    if (cue === 'won') {
      navigator.vibrate?.([60, 40, 60])
      playBuzzIn()
    } else if (cue === 'iced') {
      navigator.vibrate?.([200])
      if (guessMode) playEject()
      else playWrong()
    } else if (cue === 'open') {
      navigator.vibrate?.(15)
    }
  }, [cue, guessMode])
  const [soundMuted, setSoundMutedState] = useState(() => isSoundMuted())

  function handleCodeSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = codeInput.trim().toUpperCase()
    if (trimmed) navigate(`/buzz/${trimmed}`)
  }

  function handleJoin() {
    unlockAudio()
    if (!activeCode || !nameInput.trim() || !selectedTeamId) return
    const teamId = selectedTeamId === SPECTATOR_CHOICE ? null : selectedTeamId
    const saved: SavedIdentity = { name: nameInput.trim(), teamId }
    setIdentity(saved)
    saveIdentity(activeCode, saved)
    socketRef.current?.sendAndRemember({ type: 'join', name: saved.name, teamId: saved.teamId })
  }

  function handleBuzz() {
    unlockAudio()
    navigator.vibrate?.(40)
    socketRef.current?.send({ type: 'buzz' })
  }

  // A fresh buzzer window (a new clue, or reopened after a wrong judgment) always means
  // whatever was typed for the last one is stale.
  const [prevBuzzState, setPrevBuzzState] = useState(buzzState)
  if (buzzState !== prevBuzzState) {
    setPrevBuzzState(buzzState)
    if (buzzState === 'open') {
      setGuessInput('')
      setGuessSent(false)
    }
  }

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
  const roundKey = `${roundState?.possessionIndex}:${roundState?.guessStage}`
  const [prevRoundKey, setPrevRoundKey] = useState(roundKey)
  if (roundKey !== prevRoundKey) {
    setPrevRoundKey(roundKey)
    setModeGuessInput('')
    setModeGuessSubmitted(null)
  }

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

  // One plain-language line for "what is my phone waiting on right now".
  const status: { text: string; tone: keyof typeof STATUS_TONE } = (() => {
    if (socketStatus === 'reconnecting') return { text: '⚠️ Reconnecting — hang tight', tone: 'stop' }
    if (roundState?.mode === 'draft') {
      if (identity?.teamId === null) return { text: '👀 Watching the draft', tone: 'wait' }
      if (roundState.phase === 'final') return { text: '🏁 Draft complete — check the screen', tone: 'wait' }
      if (roundState.phase === 'ranking') {
        const mine = identity?.teamId ?? ''
        return roundState.draft?.submitted.includes(mine)
          ? { text: '✓ Ballot in — waiting for the others', tone: 'go' }
          : { text: '🗳️ Your ballot — rank everyone else', tone: 'go' }
      }
      return { text: '⏳ Waiting for the host', tone: 'wait' }
    }
    if (identity?.teamId === null) return { text: '👀 Watching — enjoy the show', tone: 'wait' }
    if (roundState?.phase === 'final') return { text: '🏁 Game over', tone: 'wait' }
    if (roundState?.phase === 'halftime') return { text: '🏀 Halftime — back soon', tone: 'wait' }
    if (iAmIced && (!guessMode || roundState?.phase === 'clue' || roundState?.guessStage)) {
      if (roundState?.suddenDeath) return { text: '💀 Sitting out sudden death', tone: 'stop' }
      return { text: guessMode ? '🟥 Ejected for this possession' : '🧊 Locked out of this clue', tone: 'stop' }
    }
    if (buzzState === 'locked' && winner) {
      return iWon ? { text: '✅ You buzzed first — answer now!', tone: 'go' } : { text: `🔒 ${winner.name} is answering`, tone: 'wait' }
    }
    if (buzzState === 'open') {
      if (guessMode) {
        const p = roundState?.guessProgress
        return modeGuessSubmitted
          ? { text: `✓ Guess in${p && p.of > 0 ? ` — ${p.teamsIn} of ${p.of} teams in` : ''}`, tone: 'go' }
          : { text: '🟢 Guessing is open', tone: 'go' }
      }
      return { text: '🟢 Window open — BUZZ!', tone: 'go' }
    }
    return { text: '⏳ Waiting for the host', tone: 'wait' }
  })()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center court-lines px-6 py-10 text-center">
      <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500">
        <span>Room {activeCode}</span>
        <button
          onClick={() => {
            unlockAudio()
            setSoundMuted(!soundMuted)
            setSoundMutedState(!soundMuted)
          }}
          aria-label={soundMuted ? 'Turn sound on' : 'Turn sound off'}
          aria-pressed={!soundMuted}
          className="rounded-full bg-arena-800 px-3 py-1 text-sm normal-case tracking-normal text-slate-300"
        >
          {soundMuted ? '🔇 Sound off' : '🔊 Sound on'}
        </button>
      </div>

      {/* Once joined, the status pill below carries the reconnecting message. */}
      {!identity && <ConnectionBanner status={socketStatus} className="mb-3" />}

      {/* Phone-only mode: a phone-safe mirror of what the host has on screen, so the room
          can play with no shared TV/laptop at all — visible even before joining/buzzing. */}
      {roundState && (
        <div className="mb-3 w-full max-w-xs rounded-xl border border-arena-700 bg-arena-800/60 p-3 text-left">
          <div className="mb-1 text-[11px] uppercase tracking-widest text-slate-500">
            {roundState.gameName}
            {roundState.mode === 'popularity' ? (
              roundState.phase === 'clue' && roundState.popularity ? (
                <> · Rank #{roundState.popularity.rank} of {roundState.popularity.totalRanks}</>
              ) : null
            ) : roundState.phase === 'clue' || roundState.phase === 'revealed' ? (
              <> · Round {roundState.possessionIndex + 1}/{roundState.totalPossessions}</>
            ) : null}
          </div>
          {roundState.phase === 'clue' && roundState.mode !== 'popularity' && (
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
          {roundState.mode === 'draft' && roundState.phase === 'ranking' && <div className="text-sm text-hardwood-300">📊 Time to rank the rosters</div>}
          {roundState.phase === 'suddendeath' && <div className="text-sm text-scoreboard-500">💀 Sudden death — look at the screen</div>}
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
                {t.avatar ? `${t.avatar} ` : ''}{t.name}{roundState.mode === 'draft' ? '' : ` ${t.score}`}
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
              {spectatorModeEnabled && (
                <button
                  onClick={() => setSelectedTeamId(SPECTATOR_CHOICE)}
                  className={`w-full rounded-xl border-2 px-3 py-2.5 text-sm font-semibold text-slate-300 ${
                    selectedTeamId === SPECTATOR_CHOICE ? 'border-slate-300' : 'border-transparent bg-arena-800'
                  }`}
                >
                  👀 Just watching (no team)
                </button>
              )}
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
            {identity?.teamId === null ? (
              <span className="text-slate-300">👀 Just watching</span>
            ) : (
              <span style={{ color: myTeam?.color }}>
                {myTeam?.avatar ? `${myTeam.avatar} ` : ''}
                {myTeam?.name ?? '…'}
              </span>
            )}
          </div>

          <div
            role="status"
            aria-live="polite"
            className={`w-full rounded-full border px-4 py-1.5 text-sm font-semibold ${STATUS_TONE[status.tone]}`}
          >
            {status.text}
          </div>

          {roundState?.mode === 'draft' ? (
            roundState.phase === 'final' ? (
              <p className="text-sm text-slate-400">That's the draft — check the screen for the final standings. 🏆</p>
            ) : roundState.phase !== 'ranking' ? (
              <p className="text-sm text-slate-400">Ranking opens once the draft's picks are in — hang tight.</p>
            ) : identity?.teamId === null ? (
              <p className="text-sm text-slate-400">Just watching — drafters are casting their ballots.</p>
            ) : roundState.draft?.submitted.includes(identity?.teamId ?? '') ? (
              <div role="status" className="rounded-xl border-2 border-scoreboard-green bg-scoreboard-green/15 px-5 py-4 text-scoreboard-green">
                <div className="font-display text-xl tracking-wide">✓ BALLOT SUBMITTED</div>
                <div className="text-xs text-slate-300">
                  {roundState.draft.submitted.length} of {roundState.teams.length} in
                </div>
              </div>
            ) : (
              <DraftBallot
                key={identity?.teamId ?? 'none'}
                drafters={roundState.teams.filter((t) => t.id !== identity?.teamId)}
                rosters={roundState.draft?.rosters ?? {}}
                onSubmit={(rankedTeamIds) => socketRef.current?.send({ type: 'ballot', rankedTeamIds })}
              />
            )
          ) : roundState?.mode === 'popularity' ? (
            roundState.phase === 'final' || !roundState.popularity ? (
              <p className="text-sm text-slate-400">That's the board — check the screen for the results.</p>
            ) : identity?.teamId === null ? (
              <p className="text-sm text-slate-400">Just watching — check the screen to follow along.</p>
            ) : (
              <PopularityPicker
                key={`${roundState.popularity.rank}:${roundState.popularity.turnTeamId}`}
                state={roundState.popularity}
                teams={roundState.teams}
                myTeamId={identity?.teamId ?? undefined}
                onPick={(id) => socketRef.current?.send({ type: 'guess', text: id })}
              />
            )
          ) : roundState?.mode === 'year' || roundState?.mode === 'tierguess' ? (
            <div className="w-full max-w-xs space-y-3">
              {identity?.teamId && iced.includes(identity.teamId) && (roundState.phase === 'clue' || roundState.guessStage) ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border-4 border-scoreboard-500/60 bg-arena-800 px-6 py-8 text-slate-300">
                  <div className="text-5xl">{roundState.suddenDeath ? '💀' : '🟥'}</div>
                  <div className="font-display text-2xl tracking-wide text-scoreboard-500">{roundState.suddenDeath ? 'SUDDEN DEATH' : 'EJECTED'}</div>
                  <div className="text-sm">
                    {roundState.suddenDeath ? "You're not in the tiebreaker — cheer on the finalists." : 'The ref has seen enough — sit this one out.'}
                  </div>
                </div>
              ) : roundState.phase === 'clue' ? (
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
                          className="min-h-14 truncate rounded-xl border-2 px-2 py-4 font-display text-xl font-semibold"
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
                      className="min-h-14 shrink-0 rounded-xl bg-hardwood-500 px-5 text-lg font-semibold text-arena-950 disabled:opacity-30 hover:bg-hardwood-400"
                    >
                      Send
                    </button>
                  </form>
                  {modeGuessSubmitted && (
                    <SentBanner text={modeGuessSubmitted} hint="Change your mind? Just tap or type a new one." />
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
                      className="min-h-14 w-full rounded-xl border border-arena-600 bg-arena-800 px-4 py-4 text-center font-display text-2xl text-white outline-none focus:border-hardwood-500"
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
                      className="min-h-14 shrink-0 rounded-xl bg-hardwood-500 px-5 text-lg font-semibold text-arena-950 disabled:opacity-30 hover:bg-hardwood-400"
                    >
                      Send
                    </button>
                  </form>
                  {modeGuessSubmitted && <SentBanner text={modeGuessSubmitted} />}
                </>
              ) : roundState.phase === 'revealed' && roundState.guessStage === 'guessMonth' ? (
                <>
                  <p className="text-sm text-slate-300">Which month?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {MONTH_SHORT_NAMES.map((m) => (
                      <button
                        key={m}
                        onClick={() => submitModeGuess(m)}
                        className="min-h-14 rounded-xl border-2 border-arena-600 bg-arena-800 px-2 py-4 font-display text-lg font-semibold text-white"
                        style={{ borderColor: modeGuessSubmitted === m ? '#f59e0b' : undefined }}
                      >
                        {modeGuessSubmitted === m ? '✓ ' : ''}
                        {m}
                      </button>
                    ))}
                  </div>
                  {modeGuessSubmitted && <SentBanner text={modeGuessSubmitted} />}
                </>
              ) : roundState.phase === 'revealed' ? (
                <p className="text-sm text-slate-400">⏳ Time's up — check the screen for the answer.</p>
              ) : null}
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
          ) : identity?.teamId && iced.includes(identity.teamId) ? (
            <div className="flex h-56 w-56 flex-col items-center justify-center rounded-full border-4 border-arena-700 bg-arena-800 text-slate-500">
              <div className="text-3xl">🚫</div>
              <div className="mt-1 px-6 text-sm">Your team already tried this one — sit tight</div>
            </div>
          ) : identity?.teamId === null ? (
            <div className="flex h-56 w-56 flex-col items-center justify-center rounded-full border-4 border-arena-700 bg-arena-800 text-slate-500">
              <div className="text-3xl">👀</div>
              <div className="mt-1 px-6 text-sm">Just watching — no buzzing in, enjoy the show</div>
            </div>
          ) : (
            <button
              onClick={handleBuzz}
              disabled={buzzState !== 'open' || socketStatus !== 'open'}
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
