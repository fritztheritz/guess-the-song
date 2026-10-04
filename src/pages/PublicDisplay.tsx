import { useEffect, useRef, useState } from 'react'
import { isLyricMode, isTierGuessMode, isYearMode, LYRIC_HINT_LABELS, type SongRound } from '../types'
import { getGame } from '../lib/storage/game-repository'
import { useStoredEntity } from '../lib/use-stored-entity'
import { presentationChannelName, type PresentationMessage, type PresentationSnapshot } from '../lib/presentation-sync'
import ShotClockDigit from '../components/ShotClockDigit'
import ArtworkFill from '../components/ArtworkFill'
import FinalPodium from '../components/FinalPodium'
import { PopReveal, RollReveal } from '../components/Reveal'
import Scoreboard from '../components/Scoreboard'
import Spinner from '../components/Spinner'
import Confetti from '../components/Confetti'
import JoinQrCode from '../components/JoinQrCode'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// The companion half of Host Controller mode — a read-only mirror meant for a TV/projector.
// Never plays audio, never mutates game state, and only ever shows what the host has
// already put on screen: driven entirely by BroadcastChannel snapshots from HostController,
// plus the existing cross-tab `storage` event for score/team/progress changes (the same
// free sync every other multi-tab feature in this app already relies on).
const BIG_SCREEN_STORAGE_KEY = 'gts.public-display.big-screen'
// How much bigger everything gets in Big Screen mode — enough to read clearly from across
// a living room on a TV, without cropping so much that a 16:9 screen loses the scoreboard.
const BIG_SCREEN_FACTOR = 1.3

function readStoredBigScreen(): boolean {
  try {
    return localStorage.getItem(BIG_SCREEN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export default function PublicDisplay({ gameId }: { gameId: string }) {
  const [game, setGame] = useStoredEntity(gameId, getGame)
  const [snapshot, setSnapshot] = useState<PresentationSnapshot | null>(null)
  const [tickedRemaining, setRemaining] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Per-device, not per-game — this page is opened directly on whatever screen it's
  // playing on (a TV, a projector, a laptop), and that screen's distance from the couch
  // doesn't change from one game to the next, so the choice should stick across games.
  const [bigScreen, setBigScreen] = useState(() => readStoredBigScreen())

  function toggleBigScreen() {
    const next = !bigScreen
    setBigScreen(next)
    try {
      localStorage.setItem(BIG_SCREEN_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // localStorage unavailable — the toggle still applies for this tab, it just won't
      // persist to the next time this screen opens the page.
    }
  }

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (!e.key || e.key === 'gts.games.v1') setGame(getGame(gameId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [gameId, setGame])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(presentationChannelName(gameId))
    channel.onmessage = (e: MessageEvent<PresentationMessage>) => {
      if (e.data?.type === 'state') setSnapshot(e.data.snapshot)
    }
    const message: PresentationMessage = { type: 'request-sync' }
    channel.postMessage(message)
    return () => channel.close()
  }, [gameId])

  // Local shot-clock countdown derived from the controller's play-start broadcast, rather
  // than syncing every 100ms tick over the wire.
  useEffect(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    if (!snapshot?.playing) return
    const { duration, startedAt } = snapshot.playing
    const tick = () => setRemaining(Math.max(0, duration - (Date.now() - startedAt) / 1000))
    tick()
    tickRef.current = setInterval(tick, 100)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [snapshot?.playing])

  const remaining = snapshot?.playing ? tickedRemaining : 0

  if (!game) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-arena-950 text-slate-400">
        <Spinner />
        <span>Loading…</span>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-arena-950 court-lines text-center text-white">
        <div className="text-5xl">🏀</div>
        <div className="font-display text-2xl tracking-wide text-hardwood-400">Waiting for host…</div>
        <p className="text-sm text-slate-500">Keep this window open — it'll follow along automatically.</p>
      </div>
    )
  }

  const round: SongRound | undefined = game.rounds[snapshot.possessionIndex]
  const isLyric = isLyricMode(game)
  const isTierGuess = isTierGuessMode(game)
  const isYear = isYearMode(game)
  const { phase, clueIndex, tierGuessStage, yearGuessStage, wager } = snapshot
  const modeLabel = isLyric ? '📝 Guess the Lyric' : isTierGuess ? '🎯 Guess the Ranking' : isYear ? '📅 Guess the Year' : '🎵 Guess the Song'
  const toGo = Math.max(0, game.rounds.length - snapshot.possessionIndex)

  return (
    <div className="fixed inset-0 overflow-hidden bg-arena-950">
      <div
        className="flex h-screen w-screen flex-col court-lines text-white"
        style={bigScreen ? { transform: `scale(${BIG_SCREEN_FACTOR})` } : undefined}
      >
        {(phase === 'resume' || phase === 'intro') && (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 text-center animate-pop-in">
            <div>
              <div className="text-6xl">🏀</div>
              <div className="mt-2 font-display text-6xl tracking-wide text-hardwood-400">{game.name}</div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-300">
                <span className="rounded-full border border-arena-600 px-3 py-1">{modeLabel}</span>
                <span className="rounded-full border border-arena-600 px-3 py-1">
                  {game.rounds.length} possession{game.rounds.length === 1 ? '' : 's'}
                </span>
                <span className="rounded-full border border-arena-600 px-3 py-1">{game.teams.length} teams</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-10">
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Tonight's teams</div>
                <Scoreboard teams={game.teams} />
              </div>
              {game.buzzerRoomCode && (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-arena-700 bg-arena-900/60 px-6 py-4">
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Scan to buzz in from your phone</div>
                  <JoinQrCode code={game.buzzerRoomCode} size={160} />
                  <div className="font-display text-3xl tracking-[0.3em] text-white">{game.buzzerRoomCode}</div>
                </div>
              )}
            </div>
            <div className="text-sm uppercase tracking-[0.3em] text-slate-500">
              {phase === 'resume' ? 'Picking up where we left off…' : 'Waiting for tip-off…'}
            </div>
          </div>
        )}

        {phase === 'clue' && round && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-between px-6 py-8">
            <div className="flex w-full items-center justify-between font-display text-lg tracking-widest text-slate-400">
              <span>{game.name.toUpperCase()}</span>
              <span>POSSESSION {snapshot.possessionIndex + 1} OF {game.rounds.length}</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto text-center">
              {round.wager && !wager ? (
                <>
                  <div className="text-xs uppercase tracking-[0.3em] text-scoreboard-amber">⭐ Wager Round</div>
                  <div className="font-display text-3xl tracking-wide text-white">THE HOST IS SETTING UP A WAGER…</div>
                </>
              ) : isLyric ? (
                <>
                  {snapshot.playing && (
                    <>
                      <ShotClockDigit seconds={remaining} />
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Answer Timer</div>
                    </>
                  )}
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Finish the lyric</div>
                  <div className="font-display text-3xl tracking-wide text-white">WHAT'S THE NEXT LINE?</div>
                  <div className="max-w-xl rounded-2xl border-2 border-dashed border-arena-600 bg-arena-800 px-8 py-6 text-xl italic text-hardwood-300">
                    “{round.lyricPrompt || '—'}”
                  </div>
                  {clueIndex === 0 ? (
                    <div className="text-xs uppercase tracking-widest text-slate-500">No hints yet — worth {round.points[0]} pts</div>
                  ) : (
                    <div className="w-full max-w-md space-y-1 text-left text-sm">
                      {LYRIC_HINT_LABELS.slice(0, clueIndex).map((label, i) => {
                        const value = i === 0 ? round.artist : i === 1 ? round.playlistHint : round.title
                        return (
                          <div key={label} className="flex justify-between gap-3 rounded-lg bg-arena-800 px-3 py-1.5">
                            <span className="text-slate-500">{label}</span>
                            <span className="text-slate-200">{value || '—'}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : isTierGuess ? (
                <>
                  {snapshot.playing && (
                    <>
                      <ShotClockDigit seconds={remaining} />
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Answer Timer</div>
                    </>
                  )}
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Guess the ranking</div>
                  <div className="font-display text-3xl tracking-wide text-white">WHAT TIER IS IT IN?</div>
                  <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl">
                    <ArtworkFill url={round.artworkUrl} />
                  </div>
                  <div>
                    <div className="font-display text-2xl text-white">{round.title}</div>
                    <div className="text-slate-400">{round.artist}</div>
                  </div>
                </>
              ) : isYear ? (
                <>
                  {wager && (
                    <div className="rounded-full bg-scoreboard-amber/15 px-4 py-1.5 text-sm font-semibold text-scoreboard-amber">
                      ⭐ {wager.teamName} wagering {wager.amount} pts
                    </div>
                  )}
                  {snapshot.playing && (
                    <>
                      <ShotClockDigit seconds={remaining} />
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Answer Timer</div>
                    </>
                  )}
                  <div className="font-display text-3xl tracking-wide text-white">WHAT YEAR IS IT FROM?</div>
                  <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl">
                    <ArtworkFill url={round.artworkUrl} />
                  </div>
                  <div>
                    <div className="font-display text-2xl text-white">{round.title}</div>
                    <div className="text-slate-400">{round.artist}</div>
                  </div>
                </>
              ) : (
                <>
                  {wager && (
                    <div className="rounded-full bg-scoreboard-amber/15 px-4 py-1.5 text-sm font-semibold text-scoreboard-amber">
                      ⭐ {wager.teamName} wagering {wager.amount} pts
                    </div>
                  )}
                  <ShotClockDigit seconds={remaining} />
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Shot Clock</div>
                  <div className="font-display text-3xl tracking-wide text-white">WHAT'S THE TRACK?</div>
                  <div className="flex h-40 w-40 items-center justify-center rounded-2xl border-2 border-dashed border-arena-600 bg-arena-800 text-5xl text-arena-600">
                    {snapshot.playing ? '♪' : '?'}
                  </div>
                  <div className="font-display text-2xl text-hardwood-400">{round.clipDurations[clueIndex]} SECONDS</div>
                </>
              )}
            </div>

            <Scoreboard teams={game.teams} compact />
          </div>
        )}

        {phase === 'revealed' && round && (
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-8 text-center">
            {!(isTierGuess && tierGuessStage === 'guessPosition') && !(isYear && yearGuessStage === 'guessMonth') && (
              <>
                <div className="pointer-events-none absolute inset-0 bg-hardwood-500/20 animate-buzzer-flash" />
                <div className="relative z-10 font-display text-4xl tracking-widest text-scoreboard-500">BUZZER BEATER</div>
              </>
            )}

            {isLyric ? (
              <div className="relative z-10 max-w-xl">
                <div className="font-display text-3xl italic text-white">“{round.lyricAnswer || '—'}”</div>
                <div className="mt-2 text-slate-400">
                  from <span className="text-slate-200">{round.title}</span> · {round.artist}
                </div>
              </div>
            ) : isTierGuess ? (
              <>
                <div className="relative z-10 h-32 w-32 shrink-0 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl animate-pop-in">
                  <ArtworkFill url={round.artworkUrl} />
                </div>
                <div className="relative z-10">
                  <div className="font-display text-2xl text-white">{round.title}</div>
                  <div className="text-slate-400">{round.artist}</div>
                </div>

                {(() => {
                  const tier = game.tierListTiers?.find((t) => t.id === round.tierId)
                  if (tierGuessStage === 'tier') {
                    return (
                      <div className="relative z-10 space-y-1.5">
                        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">It's in tier</div>
                        <span className="inline-block rounded-full px-5 py-2 font-display text-2xl text-arena-950" style={{ background: tier?.color ?? '#888' }}>
                          <PopReveal>{tier?.name ?? 'Unranked'}</PopReveal>
                        </span>
                      </div>
                    )
                  }
                  if (tierGuessStage === 'guessPosition') {
                    return (
                      <div className="relative z-10 space-y-3">
                        <span className="inline-block rounded-full px-3 py-1 font-display text-sm text-arena-950" style={{ background: tier?.color ?? '#888' }}>
                          {tier?.name ?? 'Unranked'}
                        </span>
                        <div className="font-display text-3xl tracking-wide text-white">WHAT POSITION IS IT IN?</div>
                        {round.tierSize !== undefined && (
                          <div className="text-sm text-slate-400">
                            {round.tierSize} song{round.tierSize === 1 ? '' : 's'} in {tier?.name ?? 'this tier'}
                          </div>
                        )}
                      </div>
                    )
                  }
                  return (
                    <div className="relative z-10 space-y-1.5">
                      <div className="flex items-center justify-center gap-2">
                        <span className="rounded-full px-3 py-1 font-display text-sm text-arena-950" style={{ background: tier?.color ?? '#888' }}>
                          {tier?.name ?? 'Unranked'}
                        </span>
                        <span className="text-xs uppercase tracking-[0.3em] text-slate-500">position</span>
                      </div>
                      {round.tierPosition !== undefined && (
                        <div className="font-display text-4xl text-white">
                          <PopReveal>#{round.tierPosition + 1}</PopReveal>
                          <span className="ml-2 text-lg text-slate-400">of {round.tierSize ?? '?'} in {tier?.name ?? 'this tier'}</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            ) : isYear ? (
              <>
                <div className="relative z-10 h-32 w-32 shrink-0 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl animate-pop-in">
                  <ArtworkFill url={round.artworkUrl} />
                </div>
                <div className="relative z-10">
                  <div className="font-display text-2xl text-white">{round.title}</div>
                  <div className="text-slate-400">{round.artist}</div>
                </div>

                {yearGuessStage === 'year' ? (
                  <div className="relative z-10 space-y-1.5">
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Released in</div>
                    <span className="inline-block rounded-full bg-hardwood-500 px-5 py-2 font-display text-2xl text-arena-950">
                      <RollReveal value={String(round.releaseYear ?? '—')} />
                    </span>
                  </div>
                ) : yearGuessStage === 'guessMonth' ? (
                  <div className="relative z-10 space-y-3">
                    <span className="inline-block rounded-full bg-hardwood-500 px-3 py-1 font-display text-sm text-arena-950">
                      {round.releaseYear ?? '—'}
                    </span>
                    <div className="font-display text-3xl tracking-wide text-white">WHAT MONTH IS IT?</div>
                  </div>
                ) : (
                  <div className="relative z-10 space-y-1.5">
                    <div className="flex items-center justify-center gap-2">
                      <span className="rounded-full bg-hardwood-500 px-3 py-1 font-display text-sm text-arena-950">{round.releaseYear ?? '—'}</span>
                      <span className="text-xs uppercase tracking-[0.3em] text-slate-500">month</span>
                    </div>
                    <div className="font-display text-4xl text-white">
                    <PopReveal>{round.releaseMonth ? MONTH_NAMES[round.releaseMonth - 1] : '—'}</PopReveal>
                  </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="relative z-10 h-40 w-40 shrink-0 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl animate-pop-in">
                  <ArtworkFill url={round.artworkUrl} />
                </div>
                <div className="relative z-10">
                  <div className="font-display text-3xl text-white">{round.title}</div>
                  <div className="text-slate-400">{round.artist}</div>
                </div>
              </>
            )}

            <Scoreboard teams={game.teams} compact />
          </div>
        )}

        {phase === 'halftime' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center animate-pop-in">
            <div className="text-6xl">{snapshot.suddenDeath ? '💀' : '🏀'}</div>
            <div className="font-display text-5xl tracking-widest text-hardwood-400">{snapshot.suddenDeath ? 'SUDDEN DEATH' : 'HALFTIME'}</div>
            {snapshot.halftimePrompt && <p className="max-w-md text-slate-400">{snapshot.halftimePrompt}</p>}
            <Scoreboard teams={game.teams} moves={snapshot.rankMoves} />
            {!snapshot.suddenDeath && (
              <div className="text-sm uppercase tracking-[0.3em] text-slate-500">
                {toGo} possession{toGo === 1 ? '' : 's'} to go
              </div>
            )}
            {game.buzzerRoomCode && (
              <div className="flex items-center gap-4 rounded-2xl border border-arena-700 bg-arena-900/60 px-5 py-3">
                <JoinQrCode code={game.buzzerRoomCode} size={96} />
                <div className="text-left">
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Late? Join now</div>
                  <div className="font-display text-2xl tracking-[0.3em] text-white">{game.buzzerRoomCode}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {phase === 'final' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
            <Confetti />
            <div className="font-display text-5xl tracking-widest text-hardwood-400">FINAL SCORE</div>
            <FinalPodium teams={game.teams} moves={snapshot.rankMoves} />
            <div className="font-display text-lg tracking-widest text-slate-500">GAME OVER</div>
          </div>
        )}
      </div>
      {game.buzzerRoomCode && (phase === 'clue' || phase === 'revealed') && (
        <div className="fixed bottom-3 left-3 z-20 rounded-full bg-black/40 px-3 py-1.5 text-xs text-slate-400">
          📱 Join: <span className="font-display tracking-[0.2em] text-slate-200">{game.buzzerRoomCode}</span>
        </div>
      )}
      <button
        onClick={toggleBigScreen}
        className={`fixed bottom-3 right-3 z-20 rounded-full px-3 py-1.5 text-xs ${
          bigScreen ? 'bg-hardwood-500 text-arena-950' : 'bg-black/40 text-slate-400 hover:bg-black/60'
        }`}
      >
        {bigScreen ? '🔍 Big screen: ON' : '🔍 Big screen'}
      </button>
    </div>
  )
}
