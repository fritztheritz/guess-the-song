import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DEFAULT_ANSWER_TIMER_SECONDS,
  isLyricMode,
  isTierGuessMode,
  isYearMode,
  LYRIC_HINT_LABELS,
  type Game,
  POWER_UP_KINDS,
  duplicateGame,
  powerUpsRemaining,
  type PlayerStat,
  type PowerUpKind,
  type SongRound,
  type Team,
} from '../types'
import { getGame, saveGame } from '../lib/storage/game-repository'
import { createAudioSource, type AudioSource } from '../lib/audio'
import { playBuzzer, playBuzzIn, playCorrect, playWrong, playFanfare, playStreak, playEject, playSoundboard } from '../lib/sound-effects'
import { EJECT_PHRASES, HALFTIME_PROMPTS, MONTH_NAMES, PENDING_GUESSES_KEY, POWER_UP_LABELS, SOUNDBOARD } from '../lib/host-content'
import ShotClockDigit from '../components/ShotClockDigit'
import ArtworkFill from '../components/ArtworkFill'
import Kbd from '../components/Kbd'
import FinalPodium from '../components/FinalPodium'
import { PopReveal, RollReveal } from '../components/Reveal'
import { readToolsOpen, writeToolsOpen } from '../lib/host-tools-state'
import ProgressRing from '../components/ProgressRing'
import HostTools from '../components/HostTools'
import StageStepper from '../components/StageStepper'
import CreditGrid from '../components/CreditGrid'
import SoundControl from '../components/SoundControl'
import { trackTeamStats } from '../lib/achievements'
import { SCORING, TIMING, applyScoreDeltas, parseGuessNumber, rankMoves, ranksOf, settleStreaks } from '../lib/scoring'
import { BLOCK_MARK, blockedTeams, type BlockReason } from '../lib/blocked'
import { currentThemeVarsForGuests } from '../lib/themes'
import { downloadRecapCard, type RecapCardStats } from '../lib/recap-card'
import { useFeatureFlag } from '../state/feature-flags-context'
import {
  presentationChannelName,
  type PresentationMessage,
  type PresentationSnapshot,
  type TierGuessStage,
  type YearGuessStage,
} from '../lib/presentation-sync'
import { useConfirm } from '../state/confirm-context'
import Scoreboard from '../components/Scoreboard'
import BuzzerPanel from '../components/BuzzerPanel'
import Spinner from '../components/Spinner'
import Confetti from '../components/Confetti'
import { BuzzerSocket, type SocketStatus } from '../lib/buzzer/buzzer-socket'
import ConnectionBanner from '../components/ConnectionBanner'
import { generateRoomCode, isBuzzerConfigured } from '../lib/buzzer/config'
import type { BuzzState, BuzzerPlayer, BuzzerWinner, PhoneRoundState } from '../lib/buzzer/protocol'

type Phase = 'resume' | 'intro' | 'clue' | 'revealed' | 'final' | 'halftime' | 'suddendeath'

function frozenTargetIds(game: Game | null): string[] {
  return Array.from(new Set((game?.freezes ?? []).map((f) => f.targetTeamId)))
}

export default function HostController({ gameId }: { gameId: string }) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const tierListsEnabled = useFeatureFlag('tier-lists')
  const buzzerEnabled = useFeatureFlag('phone-buzzer') && isBuzzerConfigured()
  const powerUpsEnabled = useFeatureFlag('power-ups')
  const ejectEnabled = useFeatureFlag('eject')
  const suddenDeathEnabled = useFeatureFlag('sudden-death')
  const soundboardEnabled = useFeatureFlag('soundboard')
  const [toolsOpen, setToolsOpen] = useState(readToolsOpen)
  const toggleTools = () => {
    const next = !toolsOpen
    setToolsOpen(next)
    writeToolsOpen(next)
  }
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting')
  const [rematchOpen, setRematchOpen] = useState(false)
  const [rematchShuffle, setRematchShuffle] = useState(true)
  const [rematchHandicap, setRematchHandicap] = useState(0)
  const [game, setGame] = useState<Game | null>(null)
  const [phase, setPhase] = useState<Phase>('intro')
  const [possessionIndex, setPossessionIndex] = useState(0)
  const [clueIndex, setClueIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [shotClock, setShotClock] = useState(0)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [lastAward, setLastAward] = useState<{ teamId: string; points: number } | null>(null)
  const [tierCredits, setTierCredits] = useState<Set<string>>(new Set())
  const [positionCredits, setPositionCredits] = useState<Set<string>>(new Set())
  const [exactCredits, setExactCredits] = useState<Set<string>>(new Set())
  // tierguess only: splits the reveal into three slides instead of dumping both answers on
  // screen at once — tier revealed+scored, then a "guessPosition" beat (tier is now known,
  // so players get a moment to actually guess where within it before that's revealed too),
  // then position revealed+scored.
  const [tierGuessStage, setTierGuessStage] = useState<TierGuessStage>('tier')
  // year mode's equivalent of tierCredits/positionCredits/tierGuessStage above.
  const [yearCredits, setYearCredits] = useState<Set<string>>(new Set())
  const [monthCredits, setMonthCredits] = useState<Set<string>>(new Set())
  const [exactMonthCredits, setExactMonthCredits] = useState<Set<string>>(new Set())
  const [yearGuessStage, setYearGuessStage] = useState<YearGuessStage>('year')
  // Typed guesses from connected phones, keyed by connId — Guess the Year/Tier aren't a
  // race, so this collects every submission during the current guessing window instead of
  // tracking a single buzzWinner like Song/Lyric's guess does. Consumed (and cleared) by
  // autoScoreGuesses at the moment that window closes.
  const [modeGuesses, setModeGuesses] = useState<Map<string, { teamId: string; name: string; text: string }>>(new Map())
  // Wager rounds (song/lyric only): null until the host locks one in for this possession.
  const [wagerTeamId, setWagerTeamId] = useState<string | null>(null)
  const [wagerAmount, setWagerAmount] = useState<number | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  // Host Controller / Public Display split: a second window opened via "Public Display"
  // shows a read-only, answer-free mirror of whatever's currently on screen here, synced
  // over BroadcastChannel. publicConnected only ever flips true (never back to false) —
  // detecting disconnection would need a heartbeat, and getting that wrong (flickering the
  // peek toggle) is worse than just leaving it available once a public window has shown up.
  const [publicConnected, setPublicConnected] = useState(false)
  // Off by default and only ever shown once a Public Display has connected — otherwise a
  // solo host playing single-screen would leak the answer to their own audience by peeking.
  const [peekMode, setPeekMode] = useState(false)
  // Phone Buzz-In: room state mirrored from the BuzzerRoom Durable Object. `buzzWinner`
  // tracks who buzzed first for the current possession — the host still taps a team in the
  // existing award grid to actually score it, this only decides who's allowed to answer.
  const [buzzRoster, setBuzzRoster] = useState<BuzzerPlayer[]>([])
  // Mirrors buzzRoster for the socket message handler below, which is bound once per
  // buzzer-connect effect run (not on every roster change) — reading state directly there
  // would see whatever roster existed at connect time forever, never later joins/leaves.
  const buzzRosterRef = useRef<BuzzerPlayer[]>([])
  const [buzzState, setBuzzState] = useState<BuzzState>('closed')
  const [buzzWinner, setBuzzWinner] = useState<BuzzerWinner | null>(null)
  const [buzzIced, setBuzzIced] = useState<string[]>([])
  // Keyed by connId, not just held as a bare string, so a stale guess for a since-cleared
  // or since-reassigned winner can never render under the wrong name — see the render-time
  // connId check below.
  const [buzzGuess, setBuzzGuess] = useState<{ connId: string; text: string } | null>(null)
  const [buzzerConnected, setBuzzerConnected] = useState(false)
  const [buzzerPanelOpen, setBuzzerPanelOpen] = useState(false)

  const audioSourceRef = useRef<AudioSource | null>(null)
  const shotClockTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const answerTimerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const playStartedAtRef = useRef<number | null>(null)
  // What the currently-running countdown's total length actually is — playClue's clip
  // duration and startTimer's (per-game, host-configurable) answer timer aren't the same
  // number, so the Public Display snapshot needs this instead of re-deriving it from round.clipDurations
  // (which would silently be wrong whenever the running timer isn't a clip playback).
  const activeDurationRef = useRef(0)
  // Guards halftime from firing more than once per playthrough — it's a one-time transitional
  // beat, not persisted state, so it deliberately doesn't re-trigger on resume even if that
  // lands exactly back on the halfway possession.
  const halftimeShownRef = useRef(false)
  const [halftimePrompt, setHalftimePrompt] = useState('')
  const [freezePickerFor, setFreezePickerFor] = useState<string | null>(null)
  // Transient "EJECTED" banner (key bumps so back-to-back ejections restart the animation).
  const [earnBanner, setEarnBanner] = useState<{ key: number; text: string; icon: string } | null>(null)
  const earnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ejectBanner, setEjectBanner] = useState<{ key: number; team: Team; phrase: string } | null>(null)
  const ejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Teams ejected from a specific possession — tagged with that possession's index so it
  // lapses on its own when play moves on (no reset needed). Unlike Song/Lyric's single buzz
  // window, Tier Guess/Year open a second guess window mid-possession (position/month), so the
  // ejection has to be remembered host-side and re-seeded into the room each time it opens.
  const [ejected, setEjected] = useState<{ possession: number; ids: string[] }>({ possession: -1, ids: [] })
  const ejectedIds = ejected.possession === possessionIndex ? ejected.ids : []
  // Everyone who can't act this possession (ejected, or sitting out sudden death) — see lib/blocked.ts.
  const blocked = blockedTeams(game, ejectedIds)
  const blockedIds = Array.from(blocked.keys())
  // Teams with a guess in right now (marks their credit buttons).
  const submittedTeamIds = new Set([...modeGuesses.values()].map((g) => g.teamId))
  const teamsInCount = submittedTeamIds.size
  const blockedMark = (id: string) => (blocked.has(id) ? BLOCK_MARK[blocked.get(id) as BlockReason] : '')
  const blockedIdsRef = useRef<string[]>([])
  blockedIdsRef.current = blockedIds
  const latestSnapshotRef = useRef<PresentationSnapshot | null>(null)
  const buzzerSocketRef = useRef<BuzzerSocket | null>(null)
  // Teams the keyboard buzz-in path has marked wrong for the current clue — a client-side
  // mirror of BuzzerRoom's `iced` set (see buzzer-room.js) for when there's no phone
  // connection to enforce it server-side. A ref, not state: it only ever gates a keydown
  // handler, never rendered.
  const keyboardIcedRef = useRef<Set<string>>(new Set())
  // Guards the auto-score effect below from re-firing every render while sitting in the
  // same revealed stage — set to `${round.id}:${stage}` the moment that stage gets scored.
  const scoredStageRef = useRef<string | null>(null)
  // Recap stats for the final screen — live counters, not persisted, so they only cover
  // scoring that happened in this browser tab's current playthrough (a "continue" after
  // closing the tab starts these back at zero, same tradeoff as tierCredits/lastAward etc.).
  // Standings after the first possession and at halftime, so the halftime/final boards can show
  // who climbed or dropped since.
  const rankMarksRef = useRef<{ first?: Record<string, number>; half?: Record<string, number> }>({})
  const recapRef = useRef({
    correctCount: 0,
    noScoreCount: 0,
    // Possessions already counted in correctCount, and each team's running total per possession
    // (so Tier/Year's several credits on one possession read as one bucket, not several).
    scoredRounds: new Set<string>(),
    roundTotals: new Map<string, number>(),
    biggest: null as { points: number; teamName: string; roundTitle: string } | null,
    fastestBuzz: null as { name: string; teamId: string; ms: number } | null,
    // Every buzz's (connId, at) is unique, but the same 'state' broadcast can land twice
    // (e.g. the host's socket reconnecting mid-lock replays the current state) — this
    // dedupes so a reconnect can't count one buzz as the fastest twice over.
    seenBuzzKeys: new Set<string>(),
    // Phone players' tallies for this playthrough, keyed by lowercased name (see PlayerStat).
    players: new Map<string, { name: string; teamId: string; buzzes: number; correct: number; wrong: number; points: number; fastestMs?: number }>(),
  })

  function bumpPlayer(name: string, teamId: string, update: (p: { buzzes: number; correct: number; wrong: number; points: number; fastestMs?: number }) => void) {
    const key = name.trim().toLowerCase()
    if (!key) return
    const existing = recapRef.current.players.get(key) ?? { name: name.trim(), teamId, buzzes: 0, correct: 0, wrong: 0, points: 0 }
    existing.teamId = teamId
    update(existing)
    recapRef.current.players.set(key, existing)
  }

  // Rebuilds the live recap/player tallies from the last checkpoint saved on the game (see
  // checkpointStats), so closing the tab mid-game and resuming doesn't restart them from zero.
  function hydrateRecap(g: Game | null | undefined) {
    if (!g?.recap && !g?.playerStats) return
    const idOf = (name: string) => g.teams.find((t) => t.name === name)?.id ?? ''
    const r = recapRef.current
    r.correctCount = g.recap?.correctCount ?? 0
    r.noScoreCount = g.recap?.noScoreCount ?? 0
    r.biggest = g.recap?.biggest ?? null
    r.fastestBuzz = g.recap?.fastestBuzz ? { name: g.recap.fastestBuzz.name, teamId: idOf(g.recap.fastestBuzz.teamName), ms: g.recap.fastestBuzz.ms } : null
    r.players = new Map(
      (g.playerStats ?? []).map((p) => [p.name.trim().toLowerCase(), { name: p.name, teamId: idOf(p.teamName), buzzes: p.buzzes, correct: p.correct, wrong: p.wrong, points: p.points, fastestMs: p.fastestMs }]),
    )
  }

  // Saved at each possession boundary alongside the scores, so a mid-game exit loses at most the
  // possession in flight rather than the whole recap and player tally.
  function checkpointStats(g: Game): Game {
    return { ...g, recap: buildRecapStats(g.teams), playerStats: buildPlayerStats(g.teams) }
  }

  function buildPlayerStats(teams: Team[]): PlayerStat[] {
    return Array.from(recapRef.current.players.values()).map((p) => ({
      name: p.name,
      teamName: teams.find((t) => t.id === p.teamId)?.name ?? '—',
      buzzes: p.buzzes,
      correct: p.correct,
      wrong: p.wrong,
      points: p.points,
      fastestMs: p.fastestMs,
    }))
  }

  // Always by TEAM name, and per possession: a possession counts once toward "buckets" however
  // many credits it paid, and "biggest score" is a team's total for the possession. Negative
  // points (a credit toggled back off) only adjust that running total.
  function recordScoreEvent(points: number, teamName: string, round: SongRound) {
    const r = recapRef.current
    const key = `${round.id}:${teamName}`
    const total = (r.roundTotals.get(key) ?? 0) + points
    r.roundTotals.set(key, total)
    if (points <= 0) return
    if (!r.scoredRounds.has(round.id)) {
      r.scoredRounds.add(round.id)
      r.correctCount += 1
    }
    if (!r.biggest || total > r.biggest.points) r.biggest = { points: total, teamName, roundTitle: round.title }
  }

  // Returns whether this was a genuinely new buzz (vs. the same one replayed by a
  // reconnect's state resync) — callers use that to gate anything that should only ever
  // happen once per real buzz-in, like a sound effect.
  function recordBuzzReaction(winner: BuzzerWinner): boolean {
    const key = `${winner.connId}:${winner.at}`
    if (recapRef.current.seenBuzzKeys.has(key)) return false
    recapRef.current.seenBuzzKeys.add(key)
    if (!winner.connId.startsWith('local:')) {
      bumpPlayer(winner.name, winner.teamId, (p) => {
        p.buzzes += 1
        if (winner.reactionMs != null && (p.fastestMs === undefined || winner.reactionMs < p.fastestMs)) p.fastestMs = winner.reactionMs
      })
    }
    if (winner.reactionMs != null && (!recapRef.current.fastestBuzz || winner.reactionMs < recapRef.current.fastestBuzz.ms)) {
      recapRef.current.fastestBuzz = { name: winner.name, teamId: winner.teamId, ms: winner.reactionMs }
    }
    return true
  }

  useEffect(() => {
    const loaded = getGame(gameId)
    // Tier Guess rides on the tier-lists flag — see the matching check in GameBuilder.
    if (loaded && isTierGuessMode(loaded) && !tierListsEnabled) {
      navigate('/', { replace: true })
      return
    }
    setGame(loaded)
    hydrateRecap(loaded)
    if (loaded?.progress) {
      setPossessionIndex(Math.min(loaded.progress.possessionIndex, Math.max(0, loaded.rounds.length - 1)))
      setPhase('resume')
    } else {
      setPossessionIndex(0)
      setPhase('intro')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, tierListsEnabled])

  const round: SongRound | undefined = game?.rounds[possessionIndex]
  const isTierGuess = game ? isTierGuessMode(game) : false
  const isLyric = game ? isLyricMode(game) : false
  const isYear = game ? isYearMode(game) : false
  const answerTimerSeconds = game?.answerTimerSeconds ?? DEFAULT_ANSWER_TIMER_SECONDS

  // Phone Buzz-In setup — generates (once) and persists a room code on the game itself so
  // reloading the Host Controller doesn't hand out a new code players would have to rejoin
  // with, then opens the host's WebSocket connection to that room.
  useEffect(() => {
    if (!buzzerEnabled || !game) return
    let current = game
    if (!current.buzzerRoomCode) {
      current = saveGame({ ...current, buzzerRoomCode: generateRoomCode() })
      setGame(current)
    }
    const socket = new BuzzerSocket(current.buzzerRoomCode!, 'host')
    buzzerSocketRef.current = socket
    const unsubscribeStatus = socket.onStatus(setSocketStatus)
    const unsubscribe = socket.onMessage((msg) => {
      if (msg.type === 'roster') {
        buzzRosterRef.current = msg.players
        setBuzzRoster(msg.players)
      } else if (msg.type === 'state') {
        setBuzzState(msg.buzzState)
        setBuzzWinner(msg.winner)
        setBuzzIced(msg.iced)
        if (msg.winner && recordBuzzReaction(msg.winner)) playBuzzIn()
      } else if (msg.type === 'guess') {
        if (isYear || isTierGuess) {
          // No buzzWinner exists for these modes' own guess — anyone connected can submit,
          // so every submission is collected (by connId, so a resubmit just overwrites) and
          // graded together the moment the guessing window closes. See autoScoreGuesses.
          // A spectator (teamId: null) can still submit here — the phone-side guess form
          // doesn't distinguish them — but there's no team to ever credit, so their guess
          // isn't worth collecting at all; skip straight past it.
          const player = buzzRosterRef.current.find((p) => p.connId === msg.connId)
          if (player && player.teamId && !blockedIdsRef.current.includes(player.teamId)) {
            setModeGuesses((prev) => new Map(prev).set(msg.connId, { teamId: player.teamId as string, name: player.name, text: msg.text }))
          }
        } else {
          setBuzzGuess({ connId: msg.connId, text: msg.text })
        }
      }
    })
    socket.connect()
    setBuzzerConnected(true)
    return () => {
      unsubscribe()
      unsubscribeStatus()
      socket.close()
      buzzerSocketRef.current = null
      setBuzzerConnected(false)
      setSocketStatus('connecting')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buzzerEnabled, game?.id])

  // Keeps the room's team roster (names/colors/mascots, for the join page) in sync —
  // deliberately keyed on a flattened string rather than the teams array itself, since that
  // array gets a new reference on every score change and would otherwise resend this on
  // every point.
  const teamsKey = game?.teams.map((t) => `${t.id}:${t.name}:${t.color}:${t.avatar ?? ''}`).join('|') ?? ''
  useEffect(() => {
    if (!buzzerSocketRef.current || !game) return
    buzzerSocketRef.current.sendAndRemember({
      type: 'sync-teams',
      teams: game.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, avatar: t.avatar })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsKey, buzzerConnected])

  // The buzzer/guess channel is open in 'clue' phase for every mode, plus one extra window
  // for Tier Guess/Year: the guessPosition/guessMonth beat, where the primary answer is
  // already shown but the closest-position/month follow-up is still being collected from
  // phones. Without this it'd stay closed there (phase is 'revealed' the whole time), and
  // the worker would silently drop every guess message sent during that beat.
  const guessChannelOpen =
    phase === 'clue' ||
    (isTierGuess && phase === 'revealed' && tierGuessStage === 'guessPosition') ||
    (isYear && phase === 'revealed' && yearGuessStage === 'guessMonth')
  useEffect(() => {
    if (!buzzerSocketRef.current) return
    // Power-Ups' Freeze (Song/Lyric only): seed the room's ice with the frozen team the
    // instant this clue's window actually opens, then clear it so it doesn't carry into the
    // clue after — same one-shot consume as the keyboard path below.
    const frozen = guessChannelOpen && !isTierGuess && !isYear ? frozenTargetIds(game) : []
    // Ejected teams are re-iced on every open for the rest of their possession (see `ejected`).
    const seeded = guessChannelOpen ? Array.from(new Set([...frozen, ...blockedIdsRef.current])) : []
    buzzerSocketRef.current.sendAndRemember(
      guessChannelOpen ? { type: 'open', frozenTeamIds: seeded.length > 0 ? seeded : undefined } : { type: 'close' },
    )
    if (frozen.length > 0 && game) setGame(saveGame({ ...game, freezes: [] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guessChannelOpen, buzzerConnected])

  // Local (keyboard) buzz-in — a phone-free fallback so a "who answers first" race still
  // exists without Phone Buzz-In configured or connected. Mirrors BuzzerRoom's open/close
  // cycle client-side, reusing the same buzzState/buzzWinner the phone path drives; steps
  // aside once a real phone connection is live so the two never fight over state.
  useEffect(() => {
    if (buzzerConnected || isTierGuess || isYear) return
    // Power-Ups' Freeze: same one-shot seed-then-clear as the phone path above.
    const frozen = phase === 'clue' ? frozenTargetIds(game) : []
    keyboardIcedRef.current = new Set([...frozen, ...blockedIds])
    setBuzzWinner(null)
    setBuzzState(phase === 'clue' ? 'open' : 'closed')
    if (frozen.length > 0 && game) setGame(saveGame({ ...game, freezes: [] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, buzzerConnected, isTierGuess, isYear])

  useEffect(() => {
    if (!game || !round || phase !== 'clue' || !(isTierGuess || isYear)) return
    try {
      sessionStorage.setItem(PENDING_GUESSES_KEY, JSON.stringify({ gameId: game.id, roundId: round.id, guesses: [...modeGuesses] }))
    } catch {
      // Best-effort only.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeGuesses, phase, round?.id])

  // Grades Guess the Year/Tier's no-buzz guesses the moment their guessing window closes —
  // the year/tier reveal (yearGuessStage/tierGuessStage first flips off 'year'/'tier' the
  // instant reveal() or *GuessAdvance() runs) rather than waiting for a host click, since
  // there's no single "submit" action to hang it off like Song/Lyric's markBuzzCorrect has.
  // The follow-up (position/month) is auto-credited only for an EXACT hit (closest + exact
  // bonus), which is unambiguous; "closest" for everyone else stays a host call.
  useEffect(() => {
    if (!game || !round || phase !== 'revealed') return
    const once = (stage: string, run: () => void) => {
      const key = `${round.id}:${stage}`
      if (scoredStageRef.current === key) return
      scoredStageRef.current = key
      run()
    }
    if (isYear) {
      if (yearGuessStage !== 'year') {
        once('year', () =>
          autoScoreGuesses(
            round.releaseYear !== undefined,
            (text) => Number(text.trim()) === round.releaseYear,
            [{ credited: yearCredits, setCredited: setYearCredits, points: SCORING.year, label: 'year' }],
          ),
        )
      }
      if (yearGuessStage === 'month') {
        once('month', () =>
          autoScoreGuesses(
            !!round.releaseMonth,
            isExactMonth,
            [
              { credited: monthCredits, setCredited: setMonthCredits, points: SCORING.month, label: 'closest month', match: closestMatcher(round.releaseMonth ?? 0, monthNumber) },
              { credited: exactMonthCredits, setCredited: setExactMonthCredits, points: SCORING.monthExact, label: '🎯 exact month' },
            ],
            { accuracy: false, clear: false },
          ),
        )
      }
    } else if (isTierGuess) {
      if (tierGuessStage !== 'tier') {
        once('tier', () => {
          const correctTier = game.tierListTiers?.find((t) => t.id === round.tierId)
          autoScoreGuesses(
            !!correctTier,
            (text) => !!correctTier && text.trim().toLowerCase() === correctTier.name.trim().toLowerCase(),
            [{ credited: tierCredits, setCredited: setTierCredits, points: SCORING.tier, label: 'tier' }],
          )
        })
      }
      if (tierGuessStage === 'position') {
        once('position', () =>
          autoScoreGuesses(
            round.tierPosition !== undefined,
            isExactPosition,
            [
              { credited: positionCredits, setCredited: setPositionCredits, points: SCORING.position, label: 'closest position', match: closestMatcher((round.tierPosition ?? 0) + 1, parseGuessNumber) },
              { credited: exactCredits, setCredited: setExactCredits, points: SCORING.positionExact, label: '🎯 exact position' },
            ],
            { accuracy: false, clear: false },
          ),
        )
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isYear, isTierGuess, yearGuessStage, tierGuessStage, round?.id])

  // Phone-only mode: pushes a phone-safe summary of what's on screen (never the answer
  // before it's actually revealed) down to every connected player, so a group can follow
  // the game entirely off their phones with no shared screen. Keyed on a score-inclusive
  // team key (unlike teamsKey above) since players should see live scores, not just names.
  const teamsWithScoreKey = game?.teams.map((t) => `${t.id}:${t.name}:${t.color}:${t.score}:${t.avatar ?? ''}`).join('|') ?? ''
  useEffect(() => {
    if (!buzzerSocketRef.current || !game) return
    const clueText = isLyric && phase === 'clue' ? (round?.lyricPrompt ?? null) : null
    const revealed: PhoneRoundState['revealed'] =
      phase === 'revealed' && round
        ? {
            title: round.title,
            artist: round.artist,
            artworkUrl: round.artworkUrl,
            lyricAnswer: isLyric ? round.lyricAnswer : undefined,
          }
        : null
    const guessStage: PhoneRoundState['guessStage'] =
      isTierGuess && tierGuessStage === 'guessPosition'
        ? 'guessPosition'
        : isYear && yearGuessStage === 'guessMonth'
          ? 'guessMonth'
          : undefined
    buzzerSocketRef.current.sendAndRemember({
      type: 'sync-round',
      state: {
        gameName: game.name,
        possessionIndex,
        totalPossessions: game.rounds.length,
        phase,
        mode: game.mode ?? 'song',
        clueText,
        revealed,
        teams: game.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, score: t.score, avatar: t.avatar })),
        tiers: isTierGuess ? game.tierListTiers?.map((t) => ({ name: t.name, color: t.color })) : undefined,
        guessStage,
        positionCount: guessStage === 'guessPosition' ? round?.tierSize : undefined,
        theme: currentThemeVarsForGuests(),
        suddenDeath: game.suddenDeath ? true : undefined,
        guessProgress: (isTierGuess || isYear) && guessChannelOpen ? { teamsIn: teamsInCount, of: Math.max(0, game.teams.length - blockedIds.length) } : undefined,
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, possessionIndex, round?.id, teamsWithScoreKey, buzzerConnected, isTierGuess, isYear, tierGuessStage, yearGuessStage, teamsInCount])

  useEffect(() => {
    if (phase === 'final') playFanfare()
  }, [phase])

  // A team reaching a 3+ streak gets a short confetti burst (and the streak sound) — a
  // celebration for the room, separate from the final-score one. Tracks each team's last
  // seen streak so only a genuine increase fires it.
  const seenStreaksRef = useRef<Record<string, number>>({})
  const [streakBurst, setStreakBurst] = useState<number | null>(null)
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streakKey = game?.teams.map((t) => `${t.id}:${t.streak ?? 0}`).join('|') ?? ''
  useEffect(() => {
    if (!game || phase === 'final') return
    let hit = false
    for (const t of game.teams) {
      const now = t.streak ?? 0
      if (now >= 3 && now > (seenStreaksRef.current[t.id] ?? 0)) hit = true
      seenStreaksRef.current[t.id] = now
    }
    if (!hit) return
    playStreak()
    // Deferred a tick (not set synchronously in the effect); the stop timer is held in a ref so a
    // later streak change can't strand the burst on screen.
    setTimeout(() => setStreakBurst(Date.now()), 0)
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current)
    burstTimerRef.current = setTimeout(() => setStreakBurst(null), 3600)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streakKey])

  useEffect(() => {
    audioSourceRef.current?.stop()
    stopShotClock()
    audioSourceRef.current = round && !isLyric && !isTierGuess && !isYear ? createAudioSource(round) : null
    setClueIndex(0)
    setIsPlaying(false)
    setShotClock(0)
    setPlaybackError(null)
    setTierCredits(new Set())
    setPositionCredits(new Set())
    setExactCredits(new Set())
    setTierGuessStage('tier')
    setYearCredits(new Set())
    setMonthCredits(new Set())
    setExactMonthCredits(new Set())
    setYearGuessStage('year')
    setModeGuesses(new Map())
    setWagerTeamId(null)
    setWagerAmount(round?.points[0] ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id])

  useEffect(() => {
    return () => {
      audioSourceRef.current?.stop()
      if (shotClockTimer.current) clearInterval(shotClockTimer.current)
      if (answerTimerTimeout.current) clearTimeout(answerTimerTimeout.current)
    }
  }, [])

  // Keep the latest snapshot available synchronously for the message handler below (which
  // is wired up once and would otherwise close over stale phase/possessionIndex/etc).
  // The tools tray only exists while a possession is on screen.
  const trayVisible = (phase === 'clue' || phase === 'revealed') && !!round
  const boardMoves =
    game && phase === 'halftime'
      ? rankMoves(rankMarksRef.current.first, game.teams)
      : game && phase === 'final'
        ? rankMoves(rankMarksRef.current.half ?? rankMarksRef.current.first, game.teams)
        : undefined
  const wagerTeam = wagerTeamId ? game?.teams.find((t) => t.id === wagerTeamId) : undefined
  latestSnapshotRef.current = round
    ? {
        phase: phase === 'suddendeath' ? 'halftime' : phase,
        possessionIndex,
        clueIndex,
        tierGuessStage,
        yearGuessStage,
        playing: isPlaying && playStartedAtRef.current ? { duration: activeDurationRef.current, startedAt: playStartedAtRef.current } : null,
        wager: wagerTeam && wagerAmount !== null ? { teamName: wagerTeam.name, teamColor: wagerTeam.color, amount: wagerAmount } : null,
        halftimePrompt: phase === 'halftime' ? halftimePrompt : phase === 'suddendeath' ? 'Tied at the top — the host is breaking the tie!' : null,
        suddenDeath: phase === 'suddendeath' ? true : undefined,
        rankMoves: boardMoves,
      }
    : null

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(presentationChannelName(gameId))
    channelRef.current = channel
    channel.onmessage = (e: MessageEvent<PresentationMessage>) => {
      if (e.data?.type === 'request-sync') {
        setPublicConnected(true)
        if (latestSnapshotRef.current) channel.postMessage({ type: 'state', snapshot: latestSnapshotRef.current })
      }
    }
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [gameId])

  useEffect(() => {
    if (!channelRef.current || !latestSnapshotRef.current) return
    channelRef.current.postMessage({ type: 'state', snapshot: latestSnapshotRef.current })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, possessionIndex, clueIndex, tierGuessStage, yearGuessStage, isPlaying, wagerTeamId, wagerAmount, halftimePrompt])

  function openPublicDisplay() {
    const url = new URL(window.location.href)
    url.searchParams.set('display', 'public')
    window.open(url.toString(), `gts-public-${gameId}`, 'noopener')
  }

  const stopShotClock = useCallback(() => {
    if (shotClockTimer.current) clearInterval(shotClockTimer.current)
    shotClockTimer.current = null
    if (answerTimerTimeout.current) clearTimeout(answerTimerTimeout.current)
    answerTimerTimeout.current = null
  }, [])

  // Lyric/Tier Guess/Year's "answer timer" — same shotClock/isPlaying state playClue uses for
  // Song mode's real clip-playback countdown, just driven by a fixed setTimeout instead of an
  // awaited audio promise. Reusing that state (rather than a parallel set of "timer running"
  // state) is what makes the existing broadcast-to-Public-Display wiring pick this up for free,
  // since that snapshot's `playing` field and its sync effect are already keyed off isPlaying.
  const startTimer = useCallback(
    (duration: number) => {
      if (isPlaying) return
      playStartedAtRef.current = Date.now()
      activeDurationRef.current = duration
      setIsPlaying(true)
      setShotClock(duration)
      shotClockTimer.current = setInterval(() => {
        setShotClock((s) => Math.max(0, s - 0.1))
      }, 100)
      answerTimerTimeout.current = setTimeout(() => {
        stopShotClock()
        playStartedAtRef.current = null
        setIsPlaying(false)
        setShotClock(0)
      }, duration * 1000)
    },
    [isPlaying, stopShotClock],
  )

  const playClue = useCallback(
    async (index: number) => {
      if (!round || !audioSourceRef.current || isPlaying) return
      const duration = round.clipDurations[index]
      playStartedAtRef.current = Date.now()
      activeDurationRef.current = duration
      setIsPlaying(true)
      setPlaybackError(null)
      setShotClock(duration)
      shotClockTimer.current = setInterval(() => {
        setShotClock((s) => Math.max(0, s - 0.1))
      }, 100)

      try {
        await audioSourceRef.current.play(round.clipStart, duration)
      } catch (err) {
        setPlaybackError(err instanceof Error ? err.message : 'Playback failed.')
      } finally {
        stopShotClock()
        playStartedAtRef.current = null
        setIsPlaying(false)
        setShotClock(0)
      }
    },
    [round, isPlaying, stopShotClock],
  )

  const reveal = useCallback(() => {
    audioSourceRef.current?.stop()
    stopShotClock()
    setIsPlaying(false)
    setPhase('revealed')
    setTierGuessStage('tier')
    setYearGuessStage('year')
    playBuzzer()
  }, [stopShotClock])

  // pointsOverride is set for a wager round's resolution (the win/loss amount the host
  // locked in), which replaces round.points[clueIndex] rather than adding to it.
  function award(team: Team | null, pointsOverride?: number, byPlayer?: BuzzerWinner) {
    if (!game || !round) return
    // Everything worth a banner this award (underdog bonus, earned/gifted power-ups) is gathered
    // and shown as one line at the end rather than stacking several banners on top of each other.
    const banners: string[] = []
    // Power-Ups: only fires when the ARMED team is the one actually scoring here — if a
    // different team wins (or nobody does), the armed effect stays armed for whenever that
    // team's turn actually comes, rather than fizzling on an unrelated possession.
    const armedKind = team ? (game.armedPowerUps?.find((a) => a.teamId === team.id)?.kind ?? null) : null
    let points = pointsOverride ?? round.points[clueIndex]
    if (armedKind === 'double') points *= 2
    // Catch-up (opt-in per game): a team trailing the leader by a wide margin gets +1 on an
    // ordinary correct answer — not on wager resolutions, which are already high-stakes swings.
    if (game.catchUp && team && points > 0 && pointsOverride === undefined) {
      const leader = Math.max(...game.teams.map((t) => t.score))
      if (leader - team.score >= SCORING.underdogDeficit) {
        points += SCORING.underdogBonus
        banners.push(`🐕 Underdog bonus +${SCORING.underdogBonus} for ${team.name}`)
      }
    }
    // Steal docks the same number of points from whoever's currently leading among the
    // OTHER teams — "currently leading" is read before this possession's own score lands, so
    // stealing from yourself (you're already the leader) is simply a no-op, not an error.
    const stealTarget =
      armedKind === 'steal' && team
        ? [...game.teams].filter((t) => t.id !== team.id).sort((a, b) => b.score - a.score)[0]
        : undefined
    let nextGame = game
    if (team) {
      nextGame = {
        ...game,
        teams: game.teams.map((t) => {
          if (t.id === team.id) return { ...t, score: t.score + points, streak: points > 0 ? (t.streak ?? 0) + 1 : 0 }
          if (stealTarget && t.id === stealTarget.id) return { ...t, score: t.score - points, streak: 0 }
          return { ...t, streak: 0 }
        }),
      }
      setLastAward({ teamId: team.id, points })
      recordScoreEvent(points, team.name, round)
    } else {
      setLastAward(null)
      recapRef.current.noScoreCount += 1
      // A no-score possession breaks every team's streak, not just the one who whiffed —
      // nobody continued theirs either.
      nextGame = { ...game, teams: game.teams.map((t) => ({ ...t, streak: 0 })) }
    }
    if (armedKind && team) nextGame = { ...nextGame, armedPowerUps: (game.armedPowerUps ?? []).filter((a) => a.teamId !== team.id) }
    // Earned-power-ups games: every second scored possession in a row earns the team a random
    // power-up (streak 2, 4, 6…), shown as a banner so the room sees it happen.
    if (team && game.earnedPowerUps && points > 0 && ((team.streak ?? 0) + 1) % SCORING.earnedPowerUpEvery === 0) {
      const kind = POWER_UP_KINDS[Math.floor(Math.random() * POWER_UP_KINDS.length)]
      nextGame = {
        ...nextGame,
        teams: nextGame.teams.map((t) =>
          t.id === team.id ? { ...t, powerUpsEarned: { ...t.powerUpsEarned, [kind]: (t.powerUpsEarned?.[kind] ?? 0) + 1 } } : t,
        ),
      }
      banners.push(`${team.name} earned ${POWER_UP_LABELS[kind]}!`)
    }
    // Catch-up gift: the first time a team falls far behind, it gets a free Steal to claw back
    // with (only meaningful where power-ups are in play).
    if (game.catchUp && powerUpsEnabled && team) {
      const leaderNow = Math.max(...nextGame.teams.map((t) => t.score))
      const giftees = nextGame.teams.filter((t) => !t.catchUpGifted && leaderNow - t.score >= SCORING.catchUpGiftDeficit)
      if (giftees.length > 0) {
        nextGame = {
          ...nextGame,
          teams: nextGame.teams.map((t) =>
            giftees.some((g) => g.id === t.id)
              ? { ...t, catchUpGifted: true, powerUpsGifted: { ...t.powerUpsGifted, steal: (t.powerUpsGifted?.steal ?? 0) + 1 } }
              : t,
          ),
        }
        giftees.forEach((g) => banners.push(`🐕 ${g.name} gets a free 🥷 Steal`))
      }
    }
    if (byPlayer && !byPlayer.connId.startsWith('local:')) {
      bumpPlayer(byPlayer.name, byPlayer.teamId, (p) => {
        p.correct += 1
        p.points += points
      })
    }
    if (banners.length > 0) showEarnBanner(banners.join('  ·  '))
    nextGame = { ...nextGame, teams: trackTeamStats(nextGame.teams) }
    // Recorded as soon as any score changes, not just on possession advance — otherwise
    // leaving right after awarding (before clicking "next possession") would lose the
    // fact that this game is mid-play, and reopening would look "fresh" with stale points.
    nextGame = { ...nextGame, progress: { possessionIndex, completed: false } }
    const saved = saveGame(nextGame)
    setGame(saved)
  }

  function showEarnBanner(text: string, icon = '🎁') {
    setEarnBanner({ key: Date.now(), text, icon })
    if (earnTimerRef.current) clearTimeout(earnTimerRef.current)
    earnTimerRef.current = setTimeout(() => setEarnBanner(null), TIMING.earnBannerMs)
  }

  // Host gag: throws a team out of the current possession. Song/Lyric: they can't buzz for the
  // rest of it (same ice as a wrong answer). Tier Guess/Year: their phone guesses are dropped
  // and the host can't credit them for the rest of the possession.
  function ejectTeam(team: Team) {
    if (!game || ejectedIds.includes(team.id)) return
    playEject()
    setGame(saveGame({ ...game, teams: game.teams.map((t) => (t.id === team.id ? { ...t, ejections: (t.ejections ?? 0) + 1 } : t)) }))
    setEjected({ possession: possessionIndex, ids: [...ejectedIds, team.id] })
    setModeGuesses((prev) => new Map(Array.from(prev).filter(([, g]) => g.teamId !== team.id)))
    if (buzzerSocketRef.current) {
      buzzerSocketRef.current.send({ type: 'eject', teamId: team.id })
    } else {
      keyboardIcedRef.current.add(team.id)
      if (keyboardIcedRef.current.size >= game.teams.length) keyboardIcedRef.current = new Set()
      if (buzzWinner?.teamId === team.id) {
        setBuzzWinner(null)
        setBuzzState('open')
      }
    }
    const phrase = EJECT_PHRASES[Math.floor(Math.random() * EJECT_PHRASES.length)].replace('{team}', team.name)
    setEjectBanner({ key: Date.now(), team, phrase })
    if (ejectTimerRef.current) clearTimeout(ejectTimerRef.current)
    ejectTimerRef.current = setTimeout(() => setEjectBanner(null), TIMING.ejectBannerMs)
  }

  // Spends one of `team`'s power-ups of `kind` (or refunds it). Callers check there's one left.
  function adjustPowerUpsUsed(g: Game, teamId: string, kind: PowerUpKind, delta: 1 | -1): Game {
    return {
      ...g,
      teams: g.teams.map((t) =>
        t.id === teamId ? { ...t, powerUpsUsed: { ...t.powerUpsUsed, [kind]: Math.max(0, (t.powerUpsUsed?.[kind] ?? 0) + delta) } } : t,
      ),
    }
  }

  // Arms Double/Steal for a team's next award() — spends one from their allowance. Tapping the
  // armed kind again un-arms it and refunds it (a misclick fix); arming the other kind swaps
  // (refunding the first), so a team only ever has one armed at a time.
  function toggleArmedPowerUp(team: Team, kind: 'double' | 'steal') {
    if (!game) return
    const current = game.armedPowerUps?.find((a) => a.teamId === team.id)
    let next = game
    if (current) {
      next = adjustPowerUpsUsed(next, team.id, current.kind, -1)
      next = { ...next, armedPowerUps: (next.armedPowerUps ?? []).filter((a) => a.teamId !== team.id) }
      if (current.kind === kind) return void setGame(saveGame(next))
    }
    const fresh = next.teams.find((t) => t.id === team.id)
    if (!fresh || powerUpsRemaining(next, fresh, kind) < 1) return
    next = adjustPowerUpsUsed(next, team.id, kind, 1)
    next = { ...next, armedPowerUps: [...(next.armedPowerUps ?? []), { teamId: team.id, kind }] }
    setGame(saveGame(next))
  }

  // Freeze: `by` spends one to block `target` from buzzing on the next clue. Tapping again
  // (via the same pair) isn't offered — the picker's "Cancel freeze" refunds instead.
  function spendFreeze(by: Team, target: Team) {
    if (!game || powerUpsRemaining(game, by, 'freeze') < 1) return
    let next = adjustPowerUpsUsed(game, by.id, 'freeze', 1)
    next = { ...next, freezes: [...(next.freezes ?? []), { byTeamId: by.id, targetTeamId: target.id }] }
    setGame(saveGame(next))
    setFreezePickerFor(null)
  }

  function cancelFreeze(byTeamId: string) {
    if (!game) return
    const mine = (game.freezes ?? []).filter((f) => f.byTeamId === byTeamId)
    if (mine.length === 0) return
    let next: Game = { ...game, freezes: (game.freezes ?? []).filter((f) => f.byTeamId !== byTeamId) }
    for (let i = 0; i < mine.length; i++) next = adjustPowerUpsUsed(next, byTeamId, 'freeze', -1)
    setGame(saveGame(next))
  }

  // The "Ref's call" row. Offered wherever a guess/buzz window is live: the clue itself, plus
  // Tier Guess/Year's second (position/month) guessing beat.
  function ejectRow() {
    if (!game || !ejectEnabled || game.teams.length < 2) return null
    return (
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-slate-500">Ref's call</span>
        {game.teams.map((team) => (
          <button
            key={team.id}
            onClick={() => ejectTeam(team)}
            disabled={ejectedIds.includes(team.id)}
            title={`Eject ${team.name} from this possession (just for laughs)`}
            className="flex items-center gap-1 rounded-full border border-scoreboard-500/40 bg-scoreboard-500/10 px-2.5 py-1 text-xs text-slate-300 enabled:hover:border-scoreboard-500 enabled:hover:text-white disabled:opacity-40"
          >
            🟥 <span style={{ color: team.color }}>{team.name}</span>
          </button>
        ))}
      </div>
    )
  }

  // Each team's remaining power-ups as tap-to-arm buttons (count shown; armed = highlighted;
  // tap an armed one again to refund it). Freeze opens a small picker for which rival to block.
  function powerUpBar() {
    if (!game || !powerUpsEnabled || isTierGuess || isYear || game.teams.length === 0) return null
    return (
      <div className="relative z-10 flex flex-wrap justify-center gap-2 border-t border-arena-700 pt-3">
        {game.teams.map((team) => {
          const armed = game.armedPowerUps?.find((a) => a.teamId === team.id)?.kind
          const freezeActive = (game.freezes ?? []).some((f) => f.byTeamId === team.id)
          const left = (kind: PowerUpKind) => powerUpsRemaining(game, team, kind)
          const btn = (active: boolean) =>
            `rounded-full px-1.5 py-0.5 disabled:opacity-30 ${
              active ? 'bg-scoreboard-amber font-semibold text-arena-950' : 'text-slate-400 enabled:hover:text-slate-200'
            }`
          return (
            <div key={team.id} className="relative flex items-center gap-1 rounded-full bg-arena-800/80 py-1 pl-2 pr-1 text-xs">
              <span className="max-w-[6rem] truncate font-medium" style={{ color: team.color }}>
                {team.name}
              </span>
              <button
                onClick={() => toggleArmedPowerUp(team, 'double')}
                disabled={armed !== 'double' && left('double') < 1}
                title={`Double points on ${team.name}'s next bucket`}
                aria-pressed={armed === 'double'}
                className={btn(armed === 'double')}
              >
                2x ×{left('double')}
              </button>
              <button
                onClick={() => toggleArmedPowerUp(team, 'steal')}
                disabled={armed !== 'steal' && left('steal') < 1}
                title={`${team.name}'s next bucket also docks the leader`}
                aria-pressed={armed === 'steal'}
                className={btn(armed === 'steal')}
              >
                🥷 ×{left('steal')}
              </button>
              <button
                onClick={() => (freezeActive ? cancelFreeze(team.id) : setFreezePickerFor(freezePickerFor === team.id ? null : team.id))}
                disabled={!freezeActive && left('freeze') < 1}
                title={freezeActive ? 'Cancel this freeze' : `${team.name} freezes a rival out of the next clue`}
                aria-pressed={freezeActive}
                className={btn(freezeActive)}
              >
                🧊 ×{left('freeze')}
              </button>
              {freezePickerFor === team.id && !freezeActive && (
                <div className="absolute bottom-full left-0 z-30 mb-1 w-40 space-y-1 rounded-lg border border-arena-600 bg-arena-900 p-2 text-left shadow-2xl">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">Freeze who?</div>
                  {game.teams
                    .filter((t) => t.id !== team.id)
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() => spendFreeze(team, t)}
                        className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-arena-700"
                        style={{ color: t.color }}
                      >
                        🧊 {t.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Power-ups and the ref's call, tucked into one collapsible drawer. Nothing renders when
  // neither applies (flags off, or no live window to eject from).
  function hostTools(showEject: boolean) {
    if (!game) return null
    const bar = powerUpBar()
    const row = showEject ? ejectRow() : null
    if (!bar && !row && !soundboardEnabled) return null
    const left = powerUpsEnabled && !isTierGuess && !isYear ? game.teams.reduce((n, t) => n + POWER_UP_KINDS.reduce((m, k) => m + powerUpsRemaining(game, t, k), 0), 0) : 0
    const bits = [
      left > 0 ? `${left} power-up${left === 1 ? '' : 's'} left` : '',
      (game.armedPowerUps?.length ?? 0) > 0 ? `${game.armedPowerUps?.length} armed` : '',
      (game.freezes?.length ?? 0) > 0 ? `${game.freezes?.length} frozen` : '',
      ejectedIds.length > 0 ? `${ejectedIds.length} ejected` : '',
    ].filter(Boolean)
    return (
      <HostTools open={toolsOpen} onToggle={toggleTools} summary={bits.join(' · ')}>
        {bar}
        {row}
        {soundboardEnabled && (
          <div className="relative z-10">
            <div className="mb-1.5 text-center text-[11px] uppercase tracking-widest text-slate-500">Soundboard</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {SOUNDBOARD.map((b) => (
                <button
                  key={b.sound}
                  onClick={() => playSoundboard(b.sound)}
                  title={`${b.label} (${b.key})`}
                  className="flex items-center gap-1.5 rounded-full border border-arena-600 bg-arena-800 px-2.5 py-1 text-xs text-slate-200 hover:border-hardwood-500"
                >
                  <span className="text-base">{b.icon}</span>
                  <span>{b.label}</span>
                  <kbd className="rounded bg-arena-700 px-1 font-mono text-[10px] text-slate-300">{b.key}</kbd>
                </button>
              ))}
            </div>
          </div>
        )}
      </HostTools>
    )
  }

  // Where Tier Guess / Year Guess are in their staged reveal, for the stepper.
  function stageStepper(className = '') {
    if (!isTierGuess && !isYear) return null
    const stage = isTierGuess ? tierGuessStage : yearGuessStage
    const second = isTierGuess ? 'position' : 'month'
    const first = isTierGuess ? 'tier' : 'year'
    const current = phase === 'clue' ? 0 : stage === first ? 1 : stage === (isTierGuess ? 'guessPosition' : 'guessMonth') ? 2 : 3
    return <StageStepper steps={[`Guess ${first}`, `Reveal ${first}`, `Guess ${second}`, `Reveal ${second}`]} current={current} className={className} />
  }

  function lockInWager(team: Team, amount: number) {
    setWagerTeamId(team.id)
    setWagerAmount(Math.max(0, Math.round(amount)))
  }

  // Phone Buzz-In's live judging, for the team that just locked in the buzzer — only
  // wired up for Song/Lyric (the modes that already score with a single award() call;
  // Tier Guess/Year use their own multi-team credit-toggle flow at reveal instead, and a
  // wager round already has its own dedicated correct/missed buttons for the one team
  // allowed to answer it, so buzzing doesn't apply there).
  function markBuzzCorrect() {
    if (!round) return
    const team = game?.teams.find((t) => t.id === buzzWinner?.teamId)
    if (!team) return
    playCorrect()
    award(team, undefined, buzzWinner ?? undefined)
    reveal()
  }

  function markBuzzWrong() {
    if (!buzzWinner) return
    playWrong()
    if (!buzzWinner.connId.startsWith('local:')) bumpPlayer(buzzWinner.name, buzzWinner.teamId, (p) => void (p.wrong += 1))
    if (buzzerSocketRef.current) {
      // Team-scoped, not device-scoped — the server ices this team regardless of whether
      // the buzz that just got judged actually came from a phone or the local keyboard path.
      buzzerSocketRef.current.send({ type: 'wrong', teamId: buzzWinner.teamId })
    } else {
      keyboardIcedRef.current.add(buzzWinner.teamId)
      if (game && keyboardIcedRef.current.size >= game.teams.length) keyboardIcedRef.current = new Set()
      setBuzzWinner(null)
      setBuzzState('open')
    }
  }

  // Tier Guess (and Year Guess) scoring is unlike award() above: any number of teams can
  // independently earn each credit (everyone who got the tier/year right, everyone tied for
  // closest position/month), so these are toggles the host can tap on and back off, not a
  // single pick-a-winner action.
  function toggleCredit(set: Set<string>, setSet: (next: Set<string>) => void, team: Team, points: number) {
    if (!game || !round) return
    const isOn = set.has(team.id)
    const delta = isOn ? -points : points
    const next = new Set(set)
    if (isOn) next.delete(team.id)
    else next.add(team.id)
    setSet(next)
    recordScoreEvent(delta, team.name, round)
    setGame(saveGame(applyScoreDeltas(game, { [team.id]: delta }, possessionIndex)))
  }

  const toggleTierCredit = (team: Team) => toggleCredit(tierCredits, setTierCredits, team, SCORING.tier)
  const togglePositionCredit = (team: Team) => toggleCredit(positionCredits, setPositionCredits, team, SCORING.position)
  const toggleExactCredit = (team: Team) => toggleCredit(exactCredits, setExactCredits, team, SCORING.positionExact)
  const toggleYearCredit = (team: Team) => toggleCredit(yearCredits, setYearCredits, team, SCORING.year)
  const toggleExactMonthCredit = (team: Team) => toggleCredit(exactMonthCredits, setExactMonthCredits, team, SCORING.monthExact)
  const toggleMonthCredit = (team: Team) => toggleCredit(monthCredits, setMonthCredits, team, SCORING.month)

  // Live view of whatever's in modeGuesses right now — reused for both the primary (auto-
  // scored) tier/year guess window and the closest-position/month follow-up, where it's
  // purely reference for the host's own judgment call rather than anything auto-graded.
  function submittedSoFarPanel() {
    if (!game || modeGuesses.size === 0) return null
    const teamsIn = new Set([...modeGuesses.values()].map((g) => g.teamId)).size
    return (
      <div className="mx-auto w-full max-w-sm space-y-1.5 text-center">
        <div className="flex items-center justify-center gap-3 text-xs uppercase tracking-widest text-slate-500">
          <ProgressRing value={teamsIn} max={game.teams.length - blockedIds.length} />
          <span>
            Submitted so far ({modeGuesses.size}) · {teamsIn} of {game.teams.length - blockedIds.length} teams in
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {[...modeGuesses.values()].map((g, i) => {
            const team = game.teams.find((t) => t.id === g.teamId)
            return (
              <span
                key={i}
                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: `${team?.color ?? '#888'}22`, color: team?.color }}
              >
                {(isTierGuess && tierGuessStage === 'position' && isExactPosition(g.text)) || (isYear && yearGuessStage === 'month' && isExactMonth(g.text)) ? '🎯 ' : ''}{g.name}: {g.text}
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  // Grades every typed guess collected in modeGuesses against `match` in one shot — used by
  // Guess the Year/Tier's no-buzz guessing (see PlayerBuzzer), where any number of players
  // can submit independently rather than a single buzzWinner. Deliberately NOT built on top
  // of toggleCredit in a loop: toggleCredit reads `game` from this render's closure and
  // calls saveGame immediately, so calling it more than once per tick would have each call
  // overwrite the previous one's score change instead of stacking. This does one combined
  // saveGame covering every newly-credited team instead.
  // `match` decides who was right for player accuracy stats; each grade may carry its own
  // `match` (default: the same one) so one guess can earn different credits — e.g. the closest
  // position and the exact-position bonus. `accuracy` is off for the closest-position/month
  // follow-up, where a near miss isn't "wrong" (so it doesn't touch Sharpshooter), and `clear` is
  // off there so the host can still see what came in while judging.
  function autoScoreGuesses(
    valid: boolean,
    match: (text: string) => boolean,
    grades: Array<{ credited: Set<string>; setCredited: (next: Set<string>) => void; points: number; match?: (text: string) => boolean; label: string }>,
    opts: { accuracy?: boolean; clear?: boolean } = {},
  ) {
    const { accuracy = true, clear = true } = opts
    if (!game || !round || !valid) {
      if (clear) setModeGuesses(new Map())
      return
    }
    const nextSets = grades.map((g) => new Set(g.credited))
    const deltas: Record<string, number> = {}
    const earned: Record<string, string[]> = {}
    for (const guess of modeGuesses.values()) {
      if (accuracy) {
        const isMatch = match(guess.text)
        bumpPlayer(guess.name, guess.teamId, (p) => void (isMatch ? (p.correct += 1) : (p.wrong += 1)))
      }
      const teamName = game.teams.find((t) => t.id === guess.teamId)?.name ?? guess.name
      grades.forEach((g, i) => {
        if (!(g.match ?? match)(guess.text) || nextSets[i].has(guess.teamId)) return
        nextSets[i].add(guess.teamId)
        deltas[guess.teamId] = (deltas[guess.teamId] ?? 0) + g.points
        ;(earned[guess.teamId] ??= []).push(g.label)
        bumpPlayer(guess.name, guess.teamId, (p) => void (p.points += g.points))
        recordScoreEvent(g.points, teamName, round)
      })
    }
    if (Object.keys(deltas).length > 0) {
      grades.forEach((g, i) => g.setCredited(nextSets[i]))
      setGame(saveGame(applyScoreDeltas(game, deltas, possessionIndex)))
      // One line saying where the points came from, so an auto-credit never just appears.
      showEarnBanner(
        Object.entries(deltas)
          .map(([id, pts]) => `+${pts} ${game.teams.find((t) => t.id === id)?.name ?? ''} (${earned[id].join(' + ')})`)
          .join('  ·  '),
        '✅',
      )
    }
    if (clear) setModeGuesses(new Map())
  }

  // Closest-guess matcher for numeric follow-ups (position, month): true for whoever landed
  // nearest the answer among everything submitted — ties all count, same as the host's old
  // by-hand call — so a near miss is no longer worth the same as a wild one.
  function closestMatcher(answer: number, toNumber: (text: string) => number | null) {
    const distances = [...modeGuesses.values()].map((g) => {
      const n = toNumber(g.text)
      return n === null ? null : Math.abs(n - answer)
    })
    const best = Math.min(...distances.filter((d): d is number => d !== null))
    return (text: string) => {
      const n = toNumber(text)
      return n !== null && Math.abs(n - answer) === best
    }
  }
  function monthNumber(text: string): number | null {
    const t = text.trim().toLowerCase()
    const asNumber = parseGuessNumber(t)
    if (asNumber !== null) return asNumber
    const idx = MONTH_NAMES.findIndex((m) => t.length >= 3 && m.toLowerCase().startsWith(t.slice(0, 3)))
    return idx >= 0 ? idx + 1 : null
  }

  // Whether a typed/tapped guess names exactly the revealed position or month (phones send a
  // position number, and month tap-grid short names like "Mar"; typed full names also match).
  function isExactPosition(text: string) {
    return round?.tierPosition !== undefined && text.trim().replace(/^#/, '') === String(round.tierPosition + 1)
  }
  function isExactMonth(text: string) {
    if (!round?.releaseMonth) return false
    const t = text.trim().toLowerCase()
    return t === String(round.releaseMonth) || (t.length >= 3 && MONTH_NAMES[round.releaseMonth - 1].toLowerCase().startsWith(t.slice(0, 3)))
  }

  // tierguess only: the "next" action on the reveal screen steps tier -> guessPosition ->
  // position before it actually advances to the next possession.
  // What Enter/→ does on the reveal screen — each mode advances its own staged reveal.
  function advanceReveal() {
    if (isTierGuess) tierGuessAdvance()
    else if (isYear) yearGuessAdvance()
    else nextPossession()
  }

  function tierGuessAdvance() {
    if (tierGuessStage === 'tier') {
      setTierGuessStage('guessPosition')
      return
    }
    if (tierGuessStage === 'guessPosition') {
      setTierGuessStage('position')
      return
    }
    nextPossession()
  }

  // year mode only: mirrors tierGuessAdvance — year -> guessMonth -> month -> next possession.
  function yearGuessAdvance() {
    if (yearGuessStage === 'year') {
      setYearGuessStage('guessMonth')
      return
    }
    if (yearGuessStage === 'guessMonth') {
      setYearGuessStage('month')
      return
    }
    nextPossession()
  }

  // Snapshots the finished game (recap + player tallies) and shows the final screen.
  function completeGame(g: Game) {
    setGame(
      saveGame({
        ...g,
        progress: { possessionIndex: g.rounds.length - 1, completed: true },
        recap: buildRecapStats(g.teams),
        playerStats: buildPlayerStats(g.teams),
        suddenDeath: null,
      }),
    )
    setPhase('final')
  }

  // Called when the last possession ends. If the lead is tied (and Sudden Death is on), plays a
  // reserve tiebreaker round among just the tied teams — or, with no reserve left, hands the
  // call to the host. Returns whether it took over (so the game isn't ended yet).
  function startSuddenDeath(game: Game): boolean {
    if (!suddenDeathEnabled || game.teams.length < 2) return false
    const top = Math.max(...game.teams.map((t) => t.score))
    const tied = game.teams.filter((t) => t.score === top)
    if (tied.length < 2) return false
    const contenderIds = tied.map((t) => t.id)
    const used = game.rounds.filter((r) => r.tiebreaker).length
    const reserve = game.tiebreakerRounds?.[used]
    if (reserve) {
      const rounds = [...game.rounds, { ...reserve, id: crypto.randomUUID(), tiebreaker: true }]
      const index = rounds.length - 1
      setGame(saveGame({ ...game, rounds, suddenDeath: { contenderIds }, progress: { possessionIndex: index, completed: false } }))
      setPossessionIndex(index)
      setLastAward(null)
      setPhase('clue')
    } else {
      setGame(saveGame({ ...game, suddenDeath: { contenderIds } }))
      setPhase('suddendeath')
    }
    return true
  }

  // Host-judged sudden death (no reserve round left): the winner gets the deciding point.
  function awardSuddenDeath(team: Team | null) {
    if (!game) return
    completeGame(team ? applyScoreDeltas(game, { [team.id]: SCORING.suddenDeath }) : game)
  }

  function nextPossession() {
    if (!game) return
    // Song/Lyric streaks are kept by award(); Tier/Year can credit several teams per possession,
    // so their streaks (and the Hot Streak award they feed) settle here, as the possession ends.
    const credited = isTierGuess
      ? new Set([...tierCredits, ...positionCredits, ...exactCredits])
      : isYear
        ? new Set([...yearCredits, ...monthCredits, ...exactMonthCredits])
        : null
    const current = credited ? { ...game, teams: settleStreaks(game.teams, credited) } : game
    if (possessionIndex >= game.rounds.length - 1) {
      if (credited) setGame(saveGame(current))
      if (startSuddenDeath(current)) return
      completeGame(current)
      return
    }
    if (possessionIndex === 0) rankMarksRef.current.first = ranksOf(current.teams)
    const next = possessionIndex + 1
    setGame(saveGame(checkpointStats({ ...current, progress: { possessionIndex: next, completed: false } })))
    setPossessionIndex(next)
    setLastAward(null)
    const halftimeIndex = Math.floor(game.rounds.length / 2)
    if (game.halftimeEnabled && game.rounds.length >= 4 && next === halftimeIndex && !halftimeShownRef.current) {
      halftimeShownRef.current = true
      rankMarksRef.current.half = ranksOf(current.teams)
      setHalftimePrompt(HALFTIME_PROMPTS[Math.floor(Math.random() * HALFTIME_PROMPTS.length)])
      setPhase('halftime')
    } else {
      setPhase('clue')
    }
  }

  function prevPossession() {
    if (!game || possessionIndex === 0) return
    audioSourceRef.current?.stop()
    stopShotClock()
    setIsPlaying(false)
    const prev = possessionIndex - 1
    setGame(saveGame({ ...game, progress: { possessionIndex: prev, completed: false } }))
    setPossessionIndex(prev)
    setPhase('clue')
    setLastAward(null)
  }

  // Tier/Year guesses sit in host memory until the window closes, so a reload mid-window would
  // drop them while phones still show "sent". Mirror them to sessionStorage (this tab only, the
  // primary window only) and take them back when the host hits Continue on the same possession.
  function restorePendingGuesses(gameId: string, roundId: string | undefined) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(PENDING_GUESSES_KEY) ?? 'null')
      if (saved?.gameId === gameId && saved.roundId === roundId && Array.isArray(saved.guesses)) setModeGuesses(new Map(saved.guesses))
    } catch {
      // Storage unavailable or corrupt — the guesses are simply lost, as before.
    }
  }

  function continueGame() {
    if (!game?.progress) return
    setPhase(game.progress.completed ? 'final' : 'clue')
    setClueIndex(0)
    setLastAward(null)
    if (!game.progress.completed) restorePendingGuesses(game.id, game.rounds[possessionIndex]?.id)
  }

  function restartGame() {
    if (!game) return
    const reset = saveGame({ ...game, teams: game.teams.map((t) => ({ ...t, score: 0, streak: 0, powerUpsUsed: undefined, powerUpsEarned: undefined, powerUpsGifted: undefined, catchUpGifted: undefined, bestStreak: undefined, maxDeficit: undefined, ejections: undefined })), progress: undefined, recap: undefined, armedPowerUps: [], freezes: [], suddenDeath: null, playerStats: undefined, rounds: game.rounds.filter((r) => !r.tiebreaker) })
    setGame(reset)
    setPossessionIndex(0)
    setLastAward(null)
    setPhase('intro')
    rankMarksRef.current = {}
    recapRef.current = { correctCount: 0, noScoreCount: 0, scoredRounds: new Set(), roundTotals: new Map(), biggest: null, fastestBuzz: null, seenBuzzKeys: new Set(), players: new Map() }
    halftimeShownRef.current = false
  }

  // New game for a rematch: same teams (same ids and the same buzzer room, so phones stay joined),
  // optionally shuffled rounds and a head start for everyone who didn't win. It's a separate game,
  // not a reset, so the finished one stays in Stats and any Season it's tagged into.
  function startRematch() {
    if (!game) return
    const top = Math.max(...game.teams.map((t) => t.score))
    const copy = duplicateGame(game)
    const match = /^(.*?) \(Rematch(?: (\d+))?\)$/.exec(game.name)
    copy.name = match ? `${match[1]} (Rematch ${(Number(match[2]) || 1) + 1})` : `${game.name} (Rematch)`
    copy.teams = copy.teams.map((t, i) => ({
      ...t,
      id: game.teams[i].id,
      // Up to the chosen head start, but never more than the team actually lost by — a close
      // loss earns a small boost, a blowout the full amount, and teams tied for the lead none.
      score: Math.min(rematchHandicap, top - game.teams[i].score),
    }))
    copy.buzzerRoomCode = game.buzzerRoomCode
    if (rematchShuffle) {
      for (let i = copy.rounds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copy.rounds[i], copy.rounds[j]] = [copy.rounds[j], copy.rounds[i]]
      }
    }
    const saved = saveGame(copy)
    navigate(`/games/${saved.id}/present`)
  }

  function restartClue() {
    if (isPlaying) return
    void playClue(clueIndex)
  }

  async function exitPresentation() {
    // Once the game has reached its final screen, every answer this playthrough has
    // already been shown on screen — no confirmation needed, and the editor is a fine
    // place to land. Before that, exiting is confirmed, and lands on Home rather than the
    // editor: the editor lists every round's title/artist/answer up front, which would
    // hand anyone still watching the remaining answers for the rest of the game.
    if (phase !== 'final') {
      const ok = await confirm("Exit presentation now? Make sure everyone's done watching — the game isn't finished yet.", {
        danger: true,
        confirmLabel: 'Exit',
      })
      if (!ok) return
      audioSourceRef.current?.stop()
      navigate('/')
      return
    }
    audioSourceRef.current?.stop()
    navigate(`/games/${gameId}/edit`)
  }

  function advanceClue() {
    if (!round) return
    // points.length is the canonical clue count for both modes — clipDurations is unused/
    // irrelevant for lyric rounds, but always matches it for song rounds anyway.
    if (clueIndex < round.points.length - 1) {
      setClueIndex((i) => i + 1)
    } else {
      reveal()
    }
  }

  // Keyboard controls (spec §18) — active throughout presentation mode.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // The exit-confirmation dialog has its own Escape/Enter handling — without this guard,
      // this handler's own Escape/Enter cases would fire on the same keypress and immediately
      // reopen (or fight over) the dialog it's meant to be waiting on.
      if (document.querySelector('[role="alertdialog"]')) return
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp((v) => !v)
        return
      }
      if (showHelp) {
        if (e.code === 'Escape') setShowHelp(false)
        return
      }
      if (soundboardEnabled && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const hit = SOUNDBOARD.find((b) => b.code === e.code)
        if (hit) {
          e.preventDefault()
          playSoundboard(hit.sound)
          return
        }
      }
      if (phase === 'suddendeath') {
        if (e.code === 'Escape') exitPresentation()
        return
      }
      if (phase === 'resume') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault()
          continueGame()
        } else if (e.code === 'Escape') {
          exitPresentation()
        }
        return
      }
      if (phase === 'intro') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault()
          setPhase('clue')
        }
        return
      }
      if (phase === 'final') {
        if (e.code === 'Escape') exitPresentation()
        return
      }
      if (phase === 'halftime') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault()
          setPhase('clue')
        } else if (e.code === 'Escape') {
          exitPresentation()
        }
        return
      }

      const wagerPending = !!round?.wager && !wagerTeamId
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          if (phase === 'clue' && !isLyric && !isTierGuess && !isYear && !wagerPending) void playClue(clueIndex)
          break
        case 'Enter':
          e.preventDefault()
          if (phase === 'clue') reveal()
          else if (phase === 'revealed') advanceReveal()
          break
        case 'ArrowRight':
          if (phase === 'revealed') advanceReveal()
          break
        case 'ArrowLeft':
          prevPossession()
          break
        case 'KeyR':
          if (phase === 'clue' && !isLyric && !isTierGuess && !isYear && !wagerPending) restartClue()
          break
        case 'Escape':
          exitPresentation()
          break
        default: {
          // Local (keyboard) buzz-in: digit N buzzes for game.teams[N-1]. Only meaningful
          // where Phone Buzz-In's own buzzWinner banner/judging already applies (see
          // markBuzzCorrect's comment) — same mode/wager restrictions, same buzzState gate.
          if (phase !== 'clue' || isTierGuess || isYear || wagerPending) break
          if (buzzState !== 'open' || buzzWinner) break
          const digitMatch = /^Digit([1-9])$/.exec(e.code)
          if (!digitMatch) break
          const team = game?.teams[Number(digitMatch[1]) - 1]
          if (!team || keyboardIcedRef.current.has(team.id)) break
          e.preventDefault()
          setBuzzWinner({ connId: `local:${team.id}`, name: team.name, teamId: team.id, at: Date.now(), reactionMs: null })
          setBuzzState('locked')
          playBuzzIn()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clueIndex, isPlaying, possessionIndex, showHelp, soundboardEnabled, isLyric, isTierGuess, isYear, tierGuessStage, yearGuessStage, round?.wager, wagerTeamId, buzzState, buzzWinner])

  const sortedFinal = useMemo(() => [...(game?.teams ?? [])].sort((a, b) => b.score - a.score), [game])

  // Shared by the downloadable recap card and the persisted Game.recap snapshot, so the two
  // never drift apart — both are just this same computation over whichever teams are handed in.
  function buildRecapStats(teams: Team[]): RecapCardStats {
    const sorted = [...teams].sort((a, b) => b.score - a.score)
    const fastest = recapRef.current.fastestBuzz
    return {
      winningMargin: sorted.length > 1 && sorted[0].score !== sorted[1].score ? sorted[0].score - sorted[1].score : null,
      biggest: recapRef.current.biggest,
      fastestBuzz: fastest ? { name: fastest.name, teamName: teams.find((t) => t.id === fastest.teamId)?.name ?? '—', ms: fastest.ms } : null,
      correctCount: recapRef.current.correctCount,
      noScoreCount: recapRef.current.noScoreCount,
    }
  }

  function handleDownloadRecap() {
    if (!game) return
    void downloadRecapCard({
      gameName: game.name,
      teams: sortedFinal.map((t) => ({ name: t.name, color: t.color, avatar: t.avatar, score: t.score })),
      stats: buildRecapStats(game.teams),
    })
  }

  // Host-only "peek" — the answer for whatever isn't otherwise on screen yet. Only rendered
  // once a Public Display is connected and the host has explicitly turned peeking on.
  function cheatSheetText(): string {
    if (!round) return ''
    if (isLyric) return `"${round.lyricAnswer || '—'}" — ${round.title} · ${round.artist}`
    if (isTierGuess) {
      const tier = game?.tierListTiers?.find((t) => t.id === round.tierId)
      if (tierGuessStage === 'guessPosition') {
        return `Position: #${(round.tierPosition ?? 0) + 1} of ${round.tierSize ?? '?'} (Tier ${tier?.name ?? '—'})`
      }
      return `Tier: ${tier?.name ?? '—'}`
    }
    if (isYear) {
      if (yearGuessStage === 'guessMonth') {
        return `Month: ${round.releaseMonth ? MONTH_NAMES[round.releaseMonth - 1] : '—'} (Year ${round.releaseYear ?? '—'})`
      }
      return `Year: ${round.releaseYear ?? '—'} — ${round.title} · ${round.artist}`
    }
    return `${round.title} — ${round.artist}`
  }

  const showCheatSheet =
    peekMode &&
    publicConnected &&
    !!round &&
    (phase === 'clue' ||
      (isTierGuess && phase === 'revealed' && tierGuessStage === 'guessPosition') ||
      (isYear && phase === 'revealed' && yearGuessStage === 'guessMonth'))

  if (!game) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-arena-950 text-slate-400">
        <Spinner />
        <span>Loading…</span>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-arena-950 court-lines text-white">
      {streakBurst && <Confetti key={streakBurst} />}
      {earnBanner && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center">
          <div key={earnBanner.key} className="animate-pop-in rounded-full border border-scoreboard-amber/60 bg-arena-900/95 px-6 py-2 text-lg font-semibold text-scoreboard-amber shadow-xl">
            {earnBanner.icon} {earnBanner.text}
          </div>
        </div>
      )}
      {ejectBanner && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-scoreboard-500/10">
          <div key={ejectBanner.key} className="animate-eject-stamp max-w-xl rounded-2xl border-4 border-scoreboard-500 bg-arena-950/90 px-10 py-6 text-center shadow-2xl shadow-scoreboard-500/40">
            <div className="text-6xl">🟥🧑‍⚖️</div>
            <div className="font-display text-7xl tracking-widest text-scoreboard-500">EJECTED!</div>
            <div className="mt-2 text-xl font-semibold" style={{ color: ejectBanner.team.color }}>
              {ejectBanner.phrase}
            </div>
          </div>
        </div>
      )}
      {buzzerEnabled && game.buzzerRoomCode && socketStatus !== 'open' && (
        <ConnectionBanner status={socketStatus} className="absolute left-1/2 top-14 z-30 -translate-x-1/2 shadow-lg" />
      )}
      <div className="absolute right-4 top-4 z-20 flex flex-wrap justify-end gap-2">
        {buzzerEnabled && game.buzzerRoomCode && (
          <button
            onClick={() => setBuzzerPanelOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-sm text-slate-300 hover:bg-black/60"
          >
            <span
              className={`h-2 w-2 rounded-full ${buzzState === 'open' ? 'animate-pulse bg-scoreboard-green' : buzzState === 'locked' ? 'bg-scoreboard-amber' : 'bg-slate-600'}`}
            />
            🔔 {game.buzzerRoomCode} ({buzzRoster.length})
          </button>
        )}
        {publicConnected && (
          <button
            onClick={() => setPeekMode((v) => !v)}
            className={`rounded-full px-3 py-1.5 text-sm ${peekMode ? 'bg-hardwood-500 text-arena-950' : 'bg-black/40 text-slate-300 hover:bg-black/60'}`}
          >
            {peekMode ? '🔓 Peek: ON' : '🔒 Peek: OFF'}
          </button>
        )}
        <button onClick={openPublicDisplay} className="rounded-full bg-black/40 px-3 py-1.5 text-sm text-slate-300 hover:bg-black/60">
          🖥️ Public Display{publicConnected ? ' ✓' : ''}
        </button>
        {soundboardEnabled && trayVisible && (
          <button
            onClick={toggleTools}
            className={`rounded-full px-3 py-1.5 text-sm ${toolsOpen ? 'bg-hardwood-500 text-arena-950' : 'bg-black/40 text-slate-300 hover:bg-black/60'}`}
            aria-label="Soundboard and host tools"
            title="Soundboard and host tools (Z X C V B N play sounds)"
          >
            🎛️
          </button>
        )}
        <SoundControl />
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-sm text-slate-300 hover:bg-black/60"
          aria-label="Keyboard shortcuts"
        >
          ?
        </button>
        <button onClick={exitPresentation} className="rounded-full bg-black/40 px-3 py-1.5 text-sm text-slate-300 hover:bg-black/60">
          ESC · Exit
        </button>
      </div>

      {showCheatSheet && (
        <div className="fixed bottom-4 left-4 z-20 max-w-xs rounded-xl border border-hardwood-500/50 bg-black/80 px-4 py-3 text-left shadow-xl">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-hardwood-400">🔒 Host only</div>
          <div className="text-sm text-hardwood-100">{cheatSheetText()}</div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 px-6" onClick={() => setShowHelp(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-arena-600 bg-arena-900 p-6 shadow-2xl"
          >
            <div className="mb-4 font-display text-2xl tracking-wide text-hardwood-400">KEYBOARD CONTROLS</div>
            <dl className="space-y-2 text-sm">
              {[
                // Space/R only do anything for modes that actually play an audio clip —
                // Tier-Guess and Year mode show artwork/title up front instead, with nothing
                // to play or restart.
                ...(!isTierGuess && !isYear
                  ? ([
                      ['Space', 'Play current clue'],
                      ['R', 'Restart current clue'],
                    ] as const)
                  : []),
                ['Enter', 'Reveal answer / next possession'],
                ['→', 'Next possession'],
                ['←', 'Previous possession'],
                ...(!isTierGuess && !isYear && game.teams.length > 0
                  ? ([[`1–${game.teams.length}`, 'Buzz in for that team (no phone needed)']] as const)
                  : []),
                ['Esc', 'Exit presentation'],
                ...(soundboardEnabled ? SOUNDBOARD.map((b) => [b.key, `Soundboard: ${b.label}`] as const) : []),
                ['?', 'Toggle this help'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <dt className="rounded bg-arena-700 px-2 py-0.5 font-mono text-xs text-slate-200">{key}</dt>
                  <dd className="text-slate-400">{desc}</dd>
                </div>
              ))}
            </dl>
            {!isTierGuess && !isYear && game.teams.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-arena-700 pt-3">
                {game.teams.map((team, i) => (
                  <span key={team.id} className="flex items-center gap-1.5 rounded-full bg-arena-800 py-1 pl-1 pr-2.5 text-xs" style={{ color: team.color }}>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-arena-700 font-mono text-[11px] text-slate-200">{i + 1}</span>
                    {team.avatar ? `${team.avatar} ` : ''}
                    {team.name}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowHelp(false)}
              className="mt-5 w-full rounded-full bg-hardwood-500 py-2 text-sm font-semibold text-arena-950 hover:bg-hardwood-400"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {phase === 'resume' && game.progress && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div className="font-display text-4xl tracking-wide text-hardwood-400">{game.name}</div>
          <div className="text-sm uppercase tracking-widest text-slate-500">
            {game.progress.completed
              ? 'This game already finished'
              : `In progress — Possession ${game.progress.possessionIndex + 1} of ${game.rounds.length}`}
          </div>
          <Scoreboard teams={game.teams} />
          <div className="flex gap-3">
            <button
              onClick={continueGame}
              className="rounded-full bg-hardwood-500 px-8 py-3 font-display text-xl tracking-wide text-arena-950 shadow-lg shadow-hardwood-500/20 hover:bg-hardwood-400"
            >
              {game.progress.completed ? 'VIEW FINAL SCORE' : 'CONTINUE'}
            </button>
            <button
              onClick={restartGame}
              className="rounded-full border border-arena-500 px-8 py-3 font-display text-xl tracking-wide text-slate-200 hover:border-hardwood-500"
            >
              RESTART GAME
            </button>
          </div>
        </div>
      )}

      {phase === 'intro' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div className="font-display text-5xl tracking-wide text-hardwood-400">{game.name}</div>
          <div className="text-6xl">🏀</div>
          <div className="flex gap-8 font-display text-2xl text-slate-300">
            <div>{game.rounds.length} {isLyric ? 'LYRICS' : isTierGuess ? 'SONGS' : 'TRACKS'}</div>
            <div>{game.teams.length} TEAMS</div>
            <div>1 CHAMPION</div>
          </div>
          <button
            onClick={() => setPhase('clue')}
            className="rounded-full bg-hardwood-500 px-12 py-4 font-display text-2xl tracking-wide text-arena-950 shadow-xl shadow-hardwood-500/30 hover:bg-hardwood-400"
          >
            TIP OFF <Kbd>Enter</Kbd>
          </button>
        </div>
      )}

      {phase === 'clue' && round && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-between px-6 pb-8 pt-16">
          <div className="flex w-full items-center justify-between font-display text-lg tracking-widest text-slate-400">
            <span>{game.name.toUpperCase()}</span>
            <span>{game.suddenDeath ? '💀 SUDDEN DEATH' : `POSSESSION ${possessionIndex + 1} OF ${game.rounds.length}`}</span>
          </div>

          {stageStepper()}

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-6 overflow-y-auto text-center">
            {round.wager && !wagerTeamId ? (
              <>
                <div className="text-xs uppercase tracking-[0.3em] text-scoreboard-amber">⭐ Wager Round</div>
                <div className="font-display text-3xl tracking-wide text-white">WHO'S WAGERING?</div>
                <div className="grid w-full max-w-lg grid-cols-2 gap-2 sm:grid-cols-3">
                  {game.teams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => lockInWager(team, wagerAmount ?? round.points[0])}
                      className="truncate rounded-xl border border-arena-600 bg-arena-800 px-2 py-3 font-semibold hover:border-hardwood-500"
                      style={{ color: team.color }}
                    >
                      {team.name} ({team.score} pts)
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-400">Wager amount</label>
                  <input
                    type="number"
                    min={0}
                    value={wagerAmount ?? 0}
                    onChange={(e) => setWagerAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-24 rounded-lg border border-arena-600 bg-arena-800 px-3 py-1.5 text-center text-slate-100 outline-none focus:border-hardwood-500"
                  />
                </div>
                <p className="max-w-sm text-xs text-slate-500">Pick the team wagering, set how many points they're risking, then tap their name to lock it in.</p>
              </>
            ) : isLyric ? (
              <>
                {isPlaying ? (
                  <>
                    <ShotClockDigit seconds={shotClock} />
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Answer Timer</div>
                  </>
                ) : (
                  <button
                    onClick={() => startTimer(answerTimerSeconds)}
                    className="rounded-full border border-hardwood-500 px-5 py-2 text-sm font-semibold text-hardwood-400 hover:bg-hardwood-500/10"
                  >
                    ▶ START {answerTimerSeconds}s TIMER
                  </button>
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
                {isPlaying ? (
                  <>
                    <ShotClockDigit seconds={shotClock} />
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Answer Timer</div>
                  </>
                ) : (
                  <button
                    onClick={() => startTimer(answerTimerSeconds)}
                    className="rounded-full border border-hardwood-500 px-5 py-2 text-sm font-semibold text-hardwood-400 hover:bg-hardwood-500/10"
                  >
                    ▶ START {answerTimerSeconds}s TIMER
                  </button>
                )}
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Guess the ranking</div>
                <div className="font-display text-3xl tracking-wide text-white">WHAT TIER IS IT IN?</div>

                <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl">
                  <ArtworkFill url={round.artworkUrl} />
                </div>

                <div>
                  <div className="font-display text-2xl text-white">{round.title}</div>
                  <div className="text-slate-400">{round.artist}</div>
                  {round.soundcloudUrl && (
                    <a
                      href={round.soundcloudUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 inline-block text-sm text-hardwood-400 hover:text-hardwood-300"
                    >
                      Listen on SoundCloud ↗
                    </a>
                  )}
                </div>

                {submittedSoFarPanel()}
              </>
            ) : isYear ? (
              <>
                {round.wager && wagerTeamId && (
                  <div className="rounded-full bg-scoreboard-amber/15 px-4 py-1.5 text-sm font-semibold text-scoreboard-amber">
                    ⭐ {game.teams.find((t) => t.id === wagerTeamId)?.name} wagering {wagerAmount} pts
                  </div>
                )}

                {isPlaying ? (
                  <>
                    <ShotClockDigit seconds={shotClock} />
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Answer Timer</div>
                  </>
                ) : (
                  <button
                    onClick={() => startTimer(answerTimerSeconds)}
                    className="rounded-full border border-hardwood-500 px-5 py-2 text-sm font-semibold text-hardwood-400 hover:bg-hardwood-500/10"
                  >
                    ▶ START {answerTimerSeconds}s TIMER
                  </button>
                )}

                <div className="font-display text-3xl tracking-wide text-white">WHAT YEAR IS IT FROM?</div>

                <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl">
                  <ArtworkFill url={round.artworkUrl} />
                </div>

                <div>
                  <div className="font-display text-2xl text-white">{round.title}</div>
                  <div className="text-slate-400">{round.artist}</div>
                </div>

                {submittedSoFarPanel()}
              </>
            ) : (
              <>
                {round.wager && wagerTeamId && (
                  <div className="rounded-full bg-scoreboard-amber/15 px-4 py-1.5 text-sm font-semibold text-scoreboard-amber">
                    ⭐ {game.teams.find((t) => t.id === wagerTeamId)?.name} wagering {wagerAmount} pts
                  </div>
                )}
                <ShotClockDigit seconds={shotClock} />
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Shot Clock</div>

                <div className="font-display text-3xl tracking-wide text-white">WHAT'S THE TRACK?</div>

                <div className="flex h-40 w-40 items-center justify-center rounded-2xl border-2 border-dashed border-arena-600 bg-arena-800 text-5xl text-arena-600">
                  ?
                </div>

                <div className="font-display text-2xl text-hardwood-400">{round.clipDurations[clueIndex]} SECONDS</div>

                <button
                  onClick={() => playClue(clueIndex)}
                  disabled={isPlaying}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-hardwood-500 text-3xl text-arena-950 shadow-lg shadow-hardwood-500/30 disabled:opacity-50 hover:bg-hardwood-400"
                >
                  {isPlaying ? '■' : '▶'}
                </button>

                {playbackError && <div className="max-w-md text-sm text-scoreboard-500">{playbackError}</div>}
              </>
            )}

            {!isTierGuess && !isYear && !round.wager && buzzWinner && (
              <div className="w-full max-w-sm space-y-2 rounded-xl border border-scoreboard-amber/40 bg-scoreboard-amber/10 p-4">
                <div className="text-sm font-semibold text-scoreboard-amber">
                  🔔 {buzzWinner.name} ({game.teams.find((t) => t.id === buzzWinner.teamId)?.name ?? '—'}) buzzed in!
                </div>
                {buzzGuess?.connId === buzzWinner.connId && (
                  <div className="rounded-lg bg-black/30 px-3 py-2 text-sm italic text-slate-200">"{buzzGuess.text}"</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={markBuzzCorrect}
                    className="flex-1 rounded-xl border border-scoreboard-green bg-scoreboard-green/15 py-2.5 font-semibold text-scoreboard-green hover:bg-scoreboard-green/25"
                  >
                    ✓ Correct (+{round.points[clueIndex]})
                  </button>
                  <button
                    onClick={markBuzzWrong}
                    className="flex-1 rounded-xl border border-scoreboard-500 bg-scoreboard-500/15 py-2.5 font-semibold text-scoreboard-500 hover:bg-scoreboard-500/25"
                  >
                    ✗ Wrong — reopen
                  </button>
                </div>
              </div>
            )}

            {!(round.wager && !wagerTeamId) && (
              <div className="flex gap-3">
                {!isTierGuess && !isYear && clueIndex < round.points.length - 1 && (
                  <button onClick={advanceClue} disabled={isPlaying} className="rounded-full border border-arena-500 px-5 py-2 text-sm text-slate-300 hover:border-hardwood-500 disabled:opacity-40">
                    {isLyric ? `NEXT HINT: ${LYRIC_HINT_LABELS[clueIndex]} (${round.points[clueIndex + 1]} pts)` : `NEXT CLUE (${round.clipDurations[clueIndex + 1]}s)`}
                  </button>
                )}
                <button onClick={reveal} className="rounded-full bg-scoreboard-500 px-5 py-2 text-sm font-semibold text-white hover:bg-scoreboard-500/80">
                  {isTierGuess ? 'REVEAL TIER' : isYear ? 'REVEAL YEAR' : 'REVEAL ANSWER'}
                  <Kbd>Enter</Kbd>
                </button>
              </div>
            )}
          </div>

          {hostTools(!lastAward)}

          <Scoreboard teams={game.teams} compact />
        </div>
      )}

      {phase === 'revealed' && round && (
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-5 overflow-y-auto px-6 py-8 text-center">
          {stageStepper('mt-10')}
          {/* guessPosition/guessMonth is a thinking beat, not a reveal moment — the coarse
              answer is already known and nothing new has been shown yet, so the flash/banner
              would be misleading here. */}
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
              {round.playlistUrl && (
                <a
                  href={round.playlistUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 inline-block text-sm text-hardwood-400 hover:text-hardwood-300"
                >
                  View Playlist on SoundCloud ↗
                </a>
              )}
            </div>
          ) : isTierGuess ? (
            <>
              <div className="relative z-10 h-32 w-32 shrink-0 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl animate-pop-in">
                <ArtworkFill url={round.artworkUrl} />
              </div>

              <div className="relative z-10">
                <div className="font-display text-2xl text-white">{round.title}</div>
                <div className="text-slate-400">{round.artist}</div>
                {round.soundcloudUrl && (
                  <a
                    href={round.soundcloudUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-block text-sm text-hardwood-400 hover:text-hardwood-300"
                  >
                    View on SoundCloud ↗
                  </a>
                )}
              </div>

              {(() => {
                const tier = game.tierListTiers?.find((t) => t.id === round.tierId)
                if (tierGuessStage === 'tier') {
                  return (
                    <div className="relative z-10 space-y-1.5">
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-500">It's in tier</div>
                      <span
                        className="inline-block rounded-full px-5 py-2 font-display text-2xl text-arena-950"
                        style={{ background: tier?.color ?? '#888' }}
                      >
                        <PopReveal>{tier?.name ?? 'Unranked'}</PopReveal>
                      </span>
                    </div>
                  )
                }
                if (tierGuessStage === 'guessPosition') {
                  return (
                    <div className="relative z-10 space-y-3">
                      <span
                        className="inline-block rounded-full px-3 py-1 font-display text-sm text-arena-950"
                        style={{ background: tier?.color ?? '#888' }}
                      >
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
                      <span
                        className="rounded-full px-3 py-1 font-display text-sm text-arena-950"
                        style={{ background: tier?.color ?? '#888' }}
                      >
                        {tier?.name ?? 'Unranked'}
                      </span>
                      <span className="text-xs uppercase tracking-[0.3em] text-slate-500">position</span>
                    </div>
                    {round.tierPosition !== undefined && (
                      <div className="font-display text-4xl text-white">
                        <PopReveal>#{round.tierPosition + 1}</PopReveal>
                        <span className="ml-2 text-lg text-slate-400">
                          of {round.tierSize ?? '?'} in {tier?.name ?? 'this tier'}
                        </span>
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
                {round.soundcloudUrl && (
                  <a
                    href={round.soundcloudUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-block text-sm text-hardwood-400 hover:text-hardwood-300"
                  >
                    View on SoundCloud ↗
                  </a>
                )}
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
                {round.soundcloudUrl && (
                  <a
                    href={round.soundcloudUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-block text-sm text-hardwood-400 hover:text-hardwood-300"
                  >
                    View on SoundCloud ↗
                  </a>
                )}
              </div>
            </>
          )}

          {buzzWinner && (
            <div className="relative z-10 rounded-full bg-scoreboard-amber/15 px-4 py-1.5 text-sm font-semibold text-scoreboard-amber">
              🔔 {buzzWinner.name} ({game.teams.find((t) => t.id === buzzWinner.teamId)?.name ?? '—'}) buzzed in first
            </div>
          )}

          {isTierGuess ? (
            tierGuessStage === 'guessPosition' ? (
              <div className="relative z-10 w-full max-w-lg space-y-3">{submittedSoFarPanel()}</div>
            ) : (
              <div className="relative z-10 w-full max-w-lg space-y-3">
                {tierGuessStage === 'tier' ? (
                  <div>
                    <CreditGrid title={`Got the tier right? (+${SCORING.tier})`} teams={game.teams} credited={tierCredits} onToggle={toggleTierCredit} isBlocked={(id) => blocked.has(id)} blockedMark={blockedMark} submittedIds={submittedTeamIds} />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {submittedSoFarPanel()}
                    <CreditGrid title={`Closest to position? (+${SCORING.position}, auto-credited to the nearest guess — tap to adjust)`} teams={game.teams} credited={positionCredits} onToggle={togglePositionCredit} isBlocked={(id) => blocked.has(id)} blockedMark={blockedMark} submittedIds={submittedTeamIds} />
                    <CreditGrid title={`🎯 Exact position? (+${SCORING.positionExact} bonus)`} teams={game.teams} credited={exactCredits} onToggle={toggleExactCredit} isBlocked={(id) => blocked.has(id)} blockedMark={blockedMark} submittedIds={submittedTeamIds} />
                  </div>
                )}
              </div>
            )
          ) : isYear ? (
            yearGuessStage === 'guessMonth' ? (
              <div className="relative z-10 w-full max-w-lg space-y-3">{submittedSoFarPanel()}</div>
            ) : (
              <div className="relative z-10 w-full max-w-lg space-y-3">
                {yearGuessStage === 'year' ? (
                  <div>
                    <CreditGrid title={`Got the year right? (+${SCORING.year})`} teams={game.teams} credited={yearCredits} onToggle={toggleYearCredit} isBlocked={(id) => blocked.has(id)} blockedMark={blockedMark} submittedIds={submittedTeamIds} />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {submittedSoFarPanel()}
                    <CreditGrid title={`Closest to month? (+${SCORING.month}, auto-credited to the nearest guess — tap to adjust)`} teams={game.teams} credited={monthCredits} onToggle={toggleMonthCredit} isBlocked={(id) => blocked.has(id)} blockedMark={blockedMark} submittedIds={submittedTeamIds} />
                    <CreditGrid title={`🎯 Exact month? (+${SCORING.monthExact} bonus)`} teams={game.teams} credited={exactMonthCredits} onToggle={toggleExactMonthCredit} isBlocked={(id) => blocked.has(id)} blockedMark={blockedMark} submittedIds={submittedTeamIds} />
                  </div>
                )}
              </div>
            )
          ) : round.wager && wagerTeamId ? (
            (() => {
              const team = game.teams.find((t) => t.id === wagerTeamId)
              if (!team) return null
              return lastAward ? (
                <div className="relative z-10 space-y-1">
                  <div className={`font-display text-5xl ${lastAward.points >= 0 ? 'text-scoreboard-green' : 'text-scoreboard-500'}`}>
                    {lastAward.points >= 0 ? '+' : ''}{lastAward.points}
                  </div>
                  <div className="text-sm uppercase tracking-widest text-slate-400">{team.name}</div>
                </div>
              ) : (
                <div className="relative z-10 w-full max-w-sm space-y-2">
                  <div className="text-sm uppercase tracking-widest text-slate-400">
                    ⭐ {team.name} wagered {wagerAmount} — got it?
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => award(team, wagerAmount ?? 0)}
                      className="flex-1 rounded-xl border border-scoreboard-green bg-scoreboard-green/15 py-3 font-semibold text-scoreboard-green hover:bg-scoreboard-green/25"
                    >
                      ✓ Correct (+{wagerAmount})
                    </button>
                    <button
                      onClick={() => award(team, -(wagerAmount ?? 0))}
                      className="flex-1 rounded-xl border border-scoreboard-500 bg-scoreboard-500/15 py-3 font-semibold text-scoreboard-500 hover:bg-scoreboard-500/25"
                    >
                      ✗ Missed (–{wagerAmount})
                    </button>
                  </div>
                </div>
              )
            })()
          ) : lastAward ? (
            <div className="relative z-10 space-y-1">
              <div className="font-display text-5xl text-scoreboard-green">+{lastAward.points}</div>
              <div className="text-sm uppercase tracking-widest text-slate-400">🏀 Bucket!</div>
            </div>
          ) : (
            <div className="relative z-10 w-full max-w-lg space-y-2">
              <div className="text-sm uppercase tracking-widest text-slate-400">Who got the bucket?</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {game.teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => award(team)}
                    className="truncate rounded-xl border border-arena-600 bg-arena-800 px-2 py-3 font-semibold hover:border-hardwood-500"
                    style={{ color: team.color }}
                  >
                    {team.name} +{round.points[clueIndex]}
                  </button>
                ))}
              </div>
              <button onClick={() => award(null)} className="w-full rounded-xl border border-arena-700 py-2 text-sm text-slate-500 hover:text-slate-300">
                NO SCORE
              </button>
            </div>
          )}

          {hostTools((isTierGuess && tierGuessStage === 'guessPosition') || (isYear && yearGuessStage === 'guessMonth'))}

          <Scoreboard teams={game.teams} compact />

          <button
            onClick={isTierGuess ? tierGuessAdvance : isYear ? yearGuessAdvance : nextPossession}
            className="sticky bottom-3 z-20 mt-2 shrink-0 rounded-full bg-hardwood-500 px-8 py-2.5 shadow-xl shadow-black/50 font-semibold text-arena-950 hover:bg-hardwood-400"
          >
            {isTierGuess && tierGuessStage === 'tier'
              ? 'NEXT: GUESS POSITION →'
              : isTierGuess && tierGuessStage === 'guessPosition'
                ? 'REVEAL POSITION →'
                : isYear && yearGuessStage === 'year'
                  ? 'NEXT: GUESS MONTH →'
                  : isYear && yearGuessStage === 'guessMonth'
                    ? 'REVEAL MONTH →'
                    : possessionIndex >= game.rounds.length - 1
                      ? 'FINAL SCORE →'
                      : 'NEXT POSSESSION →'}
            <Kbd>Enter</Kbd>
          </button>
        </div>
      )}

      {phase === 'halftime' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div className="text-6xl">🏀</div>
          <div className="font-display text-5xl tracking-widest text-hardwood-400">HALFTIME</div>
          <p className="max-w-md text-slate-400">{halftimePrompt}</p>
          <Scoreboard teams={game.teams} moves={boardMoves} />
          <button
            onClick={() => setPhase('clue')}
            className="rounded-full bg-hardwood-500 px-8 py-3 font-display text-xl tracking-wide text-arena-950 shadow-lg shadow-hardwood-500/20 hover:bg-hardwood-400"
          >
            SECOND HALF → <Kbd>Enter</Kbd>
          </button>
        </div>
      )}

      {phase === 'suddendeath' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div className="text-6xl">💀</div>
          <div className="font-display text-5xl tracking-widest text-scoreboard-500">SUDDEN DEATH</div>
          <p className="max-w-md text-slate-400">
            Tied at the top with no reserve round left. Ask your own tiebreaker question — whoever nails it first takes the win.
          </p>
          <div className="grid w-full max-w-lg grid-cols-2 gap-2 sm:grid-cols-3">
            {game.teams
              .filter((t) => game.suddenDeath?.contenderIds.includes(t.id))
              .map((team) => (
                <button
                  key={team.id}
                  onClick={() => awardSuddenDeath(team)}
                  className="truncate rounded-xl border border-arena-600 bg-arena-800 px-2 py-3 font-semibold hover:border-hardwood-500"
                  style={{ color: team.color }}
                >
                  {team.avatar ? `${team.avatar} ` : ''}{team.name} wins it
                </button>
              ))}
          </div>
          <Scoreboard teams={game.teams} compact />
          <button onClick={() => awardSuddenDeath(null)} className="text-sm text-slate-500 underline hover:text-slate-300">
            Call it a tie
          </button>
        </div>
      )}

      {phase === 'final' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <Confetti />
          <div className="font-display text-5xl tracking-widest text-hardwood-400">FINAL SCORE</div>
          <FinalPodium teams={game.teams} moves={boardMoves} />
          <div className="font-display text-lg tracking-widest text-slate-500">GAME OVER</div>

          {(recapRef.current.correctCount > 0 || recapRef.current.noScoreCount > 0 || recapRef.current.fastestBuzz) && (
            <div className="w-full max-w-sm space-y-2 rounded-xl border border-arena-600 bg-arena-800/60 p-4 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Recap</div>
              {sortedFinal.length > 1 && sortedFinal[0].score !== sortedFinal[1].score && (
                <div className="flex justify-between text-slate-300">
                  <span>🔥 Winning margin</span>
                  <span>{sortedFinal[0].score - sortedFinal[1].score} pts</span>
                </div>
              )}
              {recapRef.current.biggest && (
                <div className="flex justify-between gap-3 text-slate-300">
                  <span className="text-left">⚡ Biggest score</span>
                  <span className="truncate text-right">
                    +{recapRef.current.biggest.points} — {recapRef.current.biggest.teamName} on "{recapRef.current.biggest.roundTitle}"
                  </span>
                </div>
              )}
              {recapRef.current.fastestBuzz && (
                <div className="flex justify-between gap-3 text-slate-300">
                  <span className="text-left">🔔 Fastest buzz</span>
                  <span className="truncate text-right">
                    {(recapRef.current.fastestBuzz.ms / 1000).toFixed(2)}s — {recapRef.current.fastestBuzz.name} (
                    {game.teams.find((t) => t.id === recapRef.current.fastestBuzz?.teamId)?.name ?? '—'})
                  </span>
                </div>
              )}
              {(() => {
                const mvp = [...(game.playerStats ?? [])].sort((a, b) => b.points - a.points)[0]
                return mvp && mvp.points > 0 ? (
                  <div className="flex justify-between gap-3 text-slate-300">
                    <span className="text-left">⭐ MVP</span>
                    <span className="truncate text-right">
                      {mvp.name} ({mvp.teamName}) — {mvp.points} pts
                    </span>
                  </div>
                ) : null
              })()}
              <div className="flex justify-between text-slate-300">
                <span>🏀 Buckets</span>
                <span>
                  {recapRef.current.correctCount} scored
                  {recapRef.current.noScoreCount > 0 ? ` · ${recapRef.current.noScoreCount} no-score` : ''}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={restartGame} className="rounded-full bg-hardwood-500 px-6 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400">
              PLAY AGAIN
            </button>
            <button onClick={() => setRematchOpen(true)} className="rounded-full border border-hardwood-500 px-6 py-2.5 font-semibold text-hardwood-400 hover:bg-hardwood-500/10">
              🔁 REMATCH
            </button>
            <button onClick={handleDownloadRecap} className="rounded-full border border-arena-500 px-6 py-2.5 text-slate-200 hover:border-hardwood-500">
              📤 SAVE RECAP CARD
            </button>
            <button onClick={() => navigate(`/games/${gameId}/edit`)} className="rounded-full border border-arena-500 px-6 py-2.5 text-slate-200 hover:border-hardwood-500">
              EDIT GAME
            </button>
            <button onClick={() => navigate('/')} className="rounded-full border border-arena-500 px-6 py-2.5 text-slate-200 hover:border-hardwood-500">
              BACK TO HOME
            </button>
          </div>
        </div>
      )}

      {rematchOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setRematchOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-4 rounded-2xl border border-arena-600 bg-arena-900 p-6 text-left shadow-2xl">
            <div className="font-display text-2xl tracking-wide text-white">REMATCH</div>
            <p className="text-xs text-slate-500">
              Starts a fresh copy with the same teams (phones stay joined). This game's result is kept for Stats and Seasons.
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={rematchShuffle} onChange={(e) => setRematchShuffle(e.target.checked)} className="h-4 w-4 accent-hardwood-500" />
              Shuffle the round order
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
              <span>
                Head start for trailing teams
                <span className="block text-xs text-slate-500">Up to this many points, never more than they lost by.</span>
              </span>
              <input
                type="number"
                min={0}
                max={20}
                value={rematchHandicap}
                onChange={(e) => setRematchHandicap(Math.min(20, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
                className="w-16 rounded-lg border border-arena-600 bg-arena-800 px-2 py-1 text-center text-slate-100 outline-none focus:border-hardwood-500"
              />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setRematchOpen(false)} className="flex-1 rounded-full border border-arena-500 py-2 text-sm text-slate-300 hover:border-hardwood-500">
                Cancel
              </button>
              <button onClick={startRematch} className="flex-1 rounded-full bg-hardwood-500 py-2 text-sm font-semibold text-arena-950 hover:bg-hardwood-400">
                START REMATCH
              </button>
            </div>
          </div>
        </div>
      )}

      {buzzerPanelOpen && game.buzzerRoomCode && (
        <BuzzerPanel code={game.buzzerRoomCode} teams={game.teams} roster={buzzRoster} iced={buzzIced} onClose={() => setBuzzerPanelOpen(false)} />
      )}
    </div>
  )
}
