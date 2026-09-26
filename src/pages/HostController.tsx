import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DEFAULT_ANSWER_TIMER_SECONDS,
  isLyricMode,
  isTierGuessMode,
  isYearMode,
  LYRIC_HINT_LABELS,
  type Game,
  type SongRound,
  type Team,
} from '../types'
import { getGame, saveGame } from '../lib/storage/game-repository'
import { createAudioSource, type AudioSource } from '../lib/audio'
import { playBuzzer, playBuzzIn, playCorrect, playWrong, playFanfare, isSoundMuted, setSoundMuted } from '../lib/sound-effects'
import { downloadRecapCard } from '../lib/recap-card'
import { useFeatureFlag } from '../state/FeatureFlagsContext'
import {
  presentationChannelName,
  type PresentationMessage,
  type PresentationSnapshot,
  type TierGuessStage,
  type YearGuessStage,
} from '../lib/presentation-sync'
import { useConfirm } from '../state/ConfirmContext'
import Scoreboard from '../components/Scoreboard'
import BuzzerPanel from '../components/BuzzerPanel'
import Spinner from '../components/Spinner'
import Confetti from '../components/Confetti'
import { BuzzerSocket } from '../lib/buzzer/buzzer-socket'
import { generateRoomCode, isBuzzerConfigured } from '../lib/buzzer/config'
import type { BuzzState, BuzzerPlayer, BuzzerWinner, PhoneRoundState } from '../lib/buzzer/protocol'

type Phase = 'resume' | 'intro' | 'clue' | 'revealed' | 'final' | 'halftime'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Flavor text only, same "fixed set, pick one at random" philosophy as Confetti's color
// palette — not host-configurable, since the point is a light surprise beat, not a setting.
const HALFTIME_PROMPTS = [
  "Stretch it out — second half tips off in a sec.",
  "Free throw contest? Loser buys snacks next time.",
  "Check your phone. Check your score. Check your rival's face.",
  "Hydrate. Heckle. Here we go again.",
  "Somebody's about to make a comeback. Might not be you.",
]

// Fixed, not host-editable — matches the spec this mode was built to (tier match always
// worth 1, closest position always worth 2), same "fixed slots" philosophy as Guess the
// Lyric's hint points.
const TIER_GUESS_TIER_POINTS = 1
const TIER_GUESS_POSITION_POINTS = 2
// Same shape, applied to the year/month guess instead of tier/position.
const YEAR_GUESS_YEAR_POINTS = 1
const YEAR_GUESS_MONTH_POINTS = 2
export default function HostController({ gameId }: { gameId: string }) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const tierListsEnabled = useFeatureFlag('tier-lists')
  const buzzerEnabled = useFeatureFlag('phone-buzzer') && isBuzzerConfigured()
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
  // tierguess only: splits the reveal into three slides instead of dumping both answers on
  // screen at once — tier revealed+scored, then a "guessPosition" beat (tier is now known,
  // so players get a moment to actually guess where within it before that's revealed too),
  // then position revealed+scored.
  const [tierGuessStage, setTierGuessStage] = useState<TierGuessStage>('tier')
  // year mode's equivalent of tierCredits/positionCredits/tierGuessStage above.
  const [yearCredits, setYearCredits] = useState<Set<string>>(new Set())
  const [monthCredits, setMonthCredits] = useState<Set<string>>(new Set())
  const [yearGuessStage, setYearGuessStage] = useState<YearGuessStage>('year')
  // Wager rounds (song/lyric only): null until the host locks one in for this possession.
  const [wagerTeamId, setWagerTeamId] = useState<string | null>(null)
  const [wagerAmount, setWagerAmount] = useState<number | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [soundMuted, setSoundMutedState] = useState(() => isSoundMuted())
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
  const [buzzState, setBuzzState] = useState<BuzzState>('closed')
  const [buzzWinner, setBuzzWinner] = useState<BuzzerWinner | null>(null)
  const [buzzIced, setBuzzIced] = useState<string[]>([])
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
  const latestSnapshotRef = useRef<PresentationSnapshot | null>(null)
  const buzzerSocketRef = useRef<BuzzerSocket | null>(null)
  // Recap stats for the final screen — live counters, not persisted, so they only cover
  // scoring that happened in this browser tab's current playthrough (a "continue" after
  // closing the tab starts these back at zero, same tradeoff as tierCredits/lastAward etc.).
  const recapRef = useRef({
    correctCount: 0,
    noScoreCount: 0,
    biggest: null as { points: number; teamName: string; roundTitle: string } | null,
    fastestBuzz: null as { name: string; teamId: string; ms: number } | null,
    // Every buzz's (connId, at) is unique, but the same 'state' broadcast can land twice
    // (e.g. the host's socket reconnecting mid-lock replays the current state) — this
    // dedupes so a reconnect can't count one buzz as the fastest twice over.
    seenBuzzKeys: new Set<string>(),
  })

  function recordScoreEvent(points: number, teamName: string, roundTitle: string) {
    if (points > 0) {
      recapRef.current.correctCount += 1
      if (!recapRef.current.biggest || points > recapRef.current.biggest.points) {
        recapRef.current.biggest = { points, teamName, roundTitle }
      }
    }
  }

  // Returns whether this was a genuinely new buzz (vs. the same one replayed by a
  // reconnect's state resync) — callers use that to gate anything that should only ever
  // happen once per real buzz-in, like a sound effect.
  function recordBuzzReaction(winner: BuzzerWinner): boolean {
    const key = `${winner.connId}:${winner.at}`
    if (recapRef.current.seenBuzzKeys.has(key)) return false
    recapRef.current.seenBuzzKeys.add(key)
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
    const unsubscribe = socket.onMessage((msg) => {
      if (msg.type === 'roster') setBuzzRoster(msg.players)
      else if (msg.type === 'state') {
        setBuzzState(msg.buzzState)
        setBuzzWinner(msg.winner)
        setBuzzIced(msg.iced)
        if (msg.winner && recordBuzzReaction(msg.winner)) playBuzzIn()
      }
    })
    socket.connect()
    setBuzzerConnected(true)
    return () => {
      unsubscribe()
      socket.close()
      buzzerSocketRef.current = null
      setBuzzerConnected(false)
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

  // The buzzer is open exactly when the room is in 'clue' phase, for every mode/phase-entry
  // path (fresh possession, resume, "TIP OFF", prev/next) — simpler and more robust than
  // threading an open/close call through each of those individually.
  useEffect(() => {
    if (!buzzerSocketRef.current) return
    buzzerSocketRef.current.sendAndRemember(phase === 'clue' ? { type: 'open' } : { type: 'close' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, buzzerConnected])

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
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, possessionIndex, round?.id, teamsWithScoreKey, buzzerConnected])

  useEffect(() => {
    if (phase === 'final') playFanfare()
  }, [phase])

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
    setTierGuessStage('tier')
    setYearCredits(new Set())
    setMonthCredits(new Set())
    setYearGuessStage('year')
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
  const wagerTeam = wagerTeamId ? game?.teams.find((t) => t.id === wagerTeamId) : undefined
  latestSnapshotRef.current = round
    ? {
        phase,
        possessionIndex,
        clueIndex,
        tierGuessStage,
        yearGuessStage,
        playing: isPlaying && playStartedAtRef.current ? { duration: activeDurationRef.current, startedAt: playStartedAtRef.current } : null,
        wager: wagerTeam && wagerAmount !== null ? { teamName: wagerTeam.name, teamColor: wagerTeam.color, amount: wagerAmount } : null,
        halftimePrompt: phase === 'halftime' ? halftimePrompt : null,
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

  function toggleSound() {
    const next = !soundMuted
    setSoundMuted(next)
    setSoundMutedState(next)
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
  function award(team: Team | null, pointsOverride?: number) {
    if (!game || !round) return
    const points = pointsOverride ?? round.points[clueIndex]
    let nextGame = game
    if (team) {
      nextGame = {
        ...game,
        teams: game.teams.map((t) =>
          t.id === team.id
            ? { ...t, score: t.score + points, streak: points > 0 ? (t.streak ?? 0) + 1 : 0 }
            : { ...t, streak: 0 },
        ),
      }
      setLastAward({ teamId: team.id, points })
      recordScoreEvent(points, team.name, round.title)
    } else {
      setLastAward(null)
      recapRef.current.noScoreCount += 1
      // A no-score possession breaks every team's streak, not just the one who whiffed —
      // nobody continued theirs either.
      nextGame = { ...game, teams: game.teams.map((t) => ({ ...t, streak: 0 })) }
    }
    // Recorded as soon as any score changes, not just on possession advance — otherwise
    // leaving right after awarding (before clicking "next possession") would lose the
    // fact that this game is mid-play, and reopening would look "fresh" with stale points.
    nextGame = { ...nextGame, progress: { possessionIndex, completed: false } }
    const saved = saveGame(nextGame)
    setGame(saved)
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
    award(team, round.points[clueIndex])
    reveal()
  }

  function markBuzzWrong() {
    if (!buzzWinner) return
    playWrong()
    buzzerSocketRef.current?.send({ type: 'wrong', teamId: buzzWinner.teamId })
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
    if (!isOn) recordScoreEvent(points, team.name, round.title)
    const saved = saveGame({
      ...game,
      teams: game.teams.map((t) => (t.id === team.id ? { ...t, score: t.score + delta } : t)),
      progress: { possessionIndex, completed: false },
    })
    setGame(saved)
  }

  const toggleTierCredit = (team: Team) => toggleCredit(tierCredits, setTierCredits, team, TIER_GUESS_TIER_POINTS)
  const togglePositionCredit = (team: Team) => toggleCredit(positionCredits, setPositionCredits, team, TIER_GUESS_POSITION_POINTS)
  const toggleYearCredit = (team: Team) => toggleCredit(yearCredits, setYearCredits, team, YEAR_GUESS_YEAR_POINTS)
  const toggleMonthCredit = (team: Team) => toggleCredit(monthCredits, setMonthCredits, team, YEAR_GUESS_MONTH_POINTS)

  // tierguess only: the "next" action on the reveal screen steps tier -> guessPosition ->
  // position before it actually advances to the next possession.
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

  function nextPossession() {
    if (!game) return
    if (possessionIndex >= game.rounds.length - 1) {
      setGame(saveGame({ ...game, progress: { possessionIndex, completed: true } }))
      setPhase('final')
      return
    }
    const next = possessionIndex + 1
    setGame(saveGame({ ...game, progress: { possessionIndex: next, completed: false } }))
    setPossessionIndex(next)
    setLastAward(null)
    const halftimeIndex = Math.floor(game.rounds.length / 2)
    if (game.halftimeEnabled && game.rounds.length >= 4 && next === halftimeIndex && !halftimeShownRef.current) {
      halftimeShownRef.current = true
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

  function continueGame() {
    if (!game?.progress) return
    setPhase(game.progress.completed ? 'final' : 'clue')
    setClueIndex(0)
    setLastAward(null)
  }

  function restartGame() {
    if (!game) return
    const reset = saveGame({ ...game, teams: game.teams.map((t) => ({ ...t, score: 0, streak: 0 })), progress: undefined })
    setGame(reset)
    setPossessionIndex(0)
    setLastAward(null)
    setPhase('intro')
    recapRef.current = { correctCount: 0, noScoreCount: 0, biggest: null, fastestBuzz: null, seenBuzzKeys: new Set() }
    halftimeShownRef.current = false
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
          else if (phase === 'revealed') (isTierGuess ? tierGuessAdvance() : isYear ? yearGuessAdvance() : nextPossession())
          break
        case 'ArrowRight':
          if (phase === 'revealed') (isTierGuess ? tierGuessAdvance() : isYear ? yearGuessAdvance() : nextPossession())
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
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clueIndex, isPlaying, possessionIndex, showHelp, isLyric, isTierGuess, isYear, tierGuessStage, yearGuessStage, round?.wager, wagerTeamId])

  const sortedFinal = useMemo(() => [...(game?.teams ?? [])].sort((a, b) => b.score - a.score), [game])

  function handleDownloadRecap() {
    if (!game) return
    const fastest = recapRef.current.fastestBuzz
    void downloadRecapCard({
      gameName: game.name,
      teams: sortedFinal.map((t) => ({ name: t.name, color: t.color, avatar: t.avatar, score: t.score })),
      stats: {
        winningMargin: sortedFinal.length > 1 && sortedFinal[0].score !== sortedFinal[1].score ? sortedFinal[0].score - sortedFinal[1].score : null,
        biggest: recapRef.current.biggest,
        fastestBuzz: fastest ? { name: fastest.name, teamName: game.teams.find((t) => t.id === fastest.teamId)?.name ?? '—', ms: fastest.ms } : null,
        correctCount: recapRef.current.correctCount,
        noScoreCount: recapRef.current.noScoreCount,
      },
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
        <button
          onClick={toggleSound}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-sm text-slate-300 hover:bg-black/60"
          aria-label={soundMuted ? 'Unmute sound effects' : 'Mute sound effects'}
        >
          {soundMuted ? '🔇' : '🔊'}
        </button>
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
                ['Esc', 'Exit presentation'],
                ['?', 'Toggle this help'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <dt className="rounded bg-arena-700 px-2 py-0.5 font-mono text-xs text-slate-200">{key}</dt>
                  <dd className="text-slate-400">{desc}</dd>
                </div>
              ))}
            </dl>
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
            TIP OFF
          </button>
        </div>
      )}

      {phase === 'clue' && round && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-between px-6 py-8">
          <div className="flex w-full items-center justify-between pr-36 font-display text-lg tracking-widest text-slate-400">
            <span>{game.name.toUpperCase()}</span>
            <span>POSSESSION {possessionIndex + 1} OF {game.rounds.length}</span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto text-center">
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
                    <div className="scoreboard-digit font-display text-7xl text-scoreboard-amber">{Math.ceil(shotClock)}</div>
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
                    <div className="scoreboard-digit font-display text-7xl text-scoreboard-amber">{Math.ceil(shotClock)}</div>
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

                <div className="h-40 w-40 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl">
                  {round.artworkUrl && <img src={round.artworkUrl} alt="" className="h-full w-full object-cover" />}
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
                    <div className="scoreboard-digit font-display text-7xl text-scoreboard-amber">{Math.ceil(shotClock)}</div>
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

                <div className="h-40 w-40 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl">
                  {round.artworkUrl && <img src={round.artworkUrl} alt="" className="h-full w-full object-cover" />}
                </div>

                <div>
                  <div className="font-display text-2xl text-white">{round.title}</div>
                  <div className="text-slate-400">{round.artist}</div>
                </div>
              </>
            ) : (
              <>
                {round.wager && wagerTeamId && (
                  <div className="rounded-full bg-scoreboard-amber/15 px-4 py-1.5 text-sm font-semibold text-scoreboard-amber">
                    ⭐ {game.teams.find((t) => t.id === wagerTeamId)?.name} wagering {wagerAmount} pts
                  </div>
                )}
                <div className="scoreboard-digit font-display text-7xl text-scoreboard-amber">{Math.ceil(shotClock)}</div>
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
                </button>
              </div>
            )}
          </div>

          <Scoreboard teams={game.teams} compact />
        </div>
      )}

      {phase === 'revealed' && round && (
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-8 text-center">
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
              <div className="relative z-10 h-32 w-32 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl animate-pop-in">
                {round.artworkUrl && <img src={round.artworkUrl} alt="" className="h-full w-full object-cover" />}
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
                        {tier?.name ?? 'Unranked'}
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
                        #{round.tierPosition + 1}
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
              <div className="relative z-10 h-32 w-32 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl animate-pop-in">
                {round.artworkUrl && <img src={round.artworkUrl} alt="" className="h-full w-full object-cover" />}
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
                    {round.releaseYear ?? '—'}
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
                  <div className="font-display text-4xl text-white">{round.releaseMonth ? MONTH_NAMES[round.releaseMonth - 1] : '—'}</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="relative z-10 h-40 w-40 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl animate-pop-in">
                {round.artworkUrl && <img src={round.artworkUrl} alt="" className="h-full w-full object-cover" />}
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
            tierGuessStage === 'guessPosition' ? null : (
              <div className="relative z-10 w-full max-w-lg space-y-3">
                {tierGuessStage === 'tier' ? (
                  <div>
                    <div className="mb-1.5 text-sm uppercase tracking-widest text-slate-400">
                      Got the tier right? (+{TIER_GUESS_TIER_POINTS})
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {game.teams.map((team) => (
                        <button
                          key={team.id}
                          onClick={() => toggleTierCredit(team)}
                          className={`truncate rounded-xl border px-2 py-2.5 font-semibold ${
                            tierCredits.has(team.id) ? 'border-scoreboard-green bg-scoreboard-green/15' : 'border-arena-600 bg-arena-800 hover:border-hardwood-500'
                          }`}
                          style={{ color: team.color }}
                        >
                          {tierCredits.has(team.id) ? '✓ ' : ''}
                          {team.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-1.5 text-sm uppercase tracking-widest text-slate-400">
                      Closest to position? (+{TIER_GUESS_POSITION_POINTS})
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {game.teams.map((team) => (
                        <button
                          key={team.id}
                          onClick={() => togglePositionCredit(team)}
                          className={`truncate rounded-xl border px-2 py-2.5 font-semibold ${
                            positionCredits.has(team.id) ? 'border-scoreboard-green bg-scoreboard-green/15' : 'border-arena-600 bg-arena-800 hover:border-hardwood-500'
                          }`}
                          style={{ color: team.color }}
                        >
                          {positionCredits.has(team.id) ? '✓ ' : ''}
                          {team.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : isYear ? (
            yearGuessStage === 'guessMonth' ? null : (
              <div className="relative z-10 w-full max-w-lg space-y-3">
                {yearGuessStage === 'year' ? (
                  <div>
                    <div className="mb-1.5 text-sm uppercase tracking-widest text-slate-400">
                      Got the year right? (+{YEAR_GUESS_YEAR_POINTS})
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {game.teams.map((team) => (
                        <button
                          key={team.id}
                          onClick={() => toggleYearCredit(team)}
                          className={`truncate rounded-xl border px-2 py-2.5 font-semibold ${
                            yearCredits.has(team.id) ? 'border-scoreboard-green bg-scoreboard-green/15' : 'border-arena-600 bg-arena-800 hover:border-hardwood-500'
                          }`}
                          style={{ color: team.color }}
                        >
                          {yearCredits.has(team.id) ? '✓ ' : ''}
                          {team.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-1.5 text-sm uppercase tracking-widest text-slate-400">
                      Got the month right? (+{YEAR_GUESS_MONTH_POINTS})
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {game.teams.map((team) => (
                        <button
                          key={team.id}
                          onClick={() => toggleMonthCredit(team)}
                          className={`truncate rounded-xl border px-2 py-2.5 font-semibold ${
                            monthCredits.has(team.id) ? 'border-scoreboard-green bg-scoreboard-green/15' : 'border-arena-600 bg-arena-800 hover:border-hardwood-500'
                          }`}
                          style={{ color: team.color }}
                        >
                          {monthCredits.has(team.id) ? '✓ ' : ''}
                          {team.name}
                        </button>
                      ))}
                    </div>
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

          <Scoreboard teams={game.teams} compact />

          <button
            onClick={isTierGuess ? tierGuessAdvance : isYear ? yearGuessAdvance : nextPossession}
            className="relative z-10 mt-2 rounded-full bg-hardwood-500 px-8 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400"
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
          </button>
        </div>
      )}

      {phase === 'halftime' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div className="text-6xl">🏀</div>
          <div className="font-display text-5xl tracking-widest text-hardwood-400">HALFTIME</div>
          <p className="max-w-md text-slate-400">{halftimePrompt}</p>
          <Scoreboard teams={game.teams} />
          <button
            onClick={() => setPhase('clue')}
            className="rounded-full bg-hardwood-500 px-8 py-3 font-display text-xl tracking-wide text-arena-950 shadow-lg shadow-hardwood-500/20 hover:bg-hardwood-400"
          >
            SECOND HALF →
          </button>
        </div>
      )}

      {phase === 'final' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <Confetti />
          <div className="font-display text-5xl tracking-widest text-hardwood-400">FINAL SCORE</div>
          <div className="space-y-3">
            {sortedFinal.map((team, i) => (
              <div key={team.id} className="flex w-72 items-center justify-between rounded-xl border border-arena-600 bg-arena-800/70 px-5 py-3">
                <span className="font-display text-xl" style={{ color: team.color }}>
                  {i === 0 ? '🏆 ' : ''}{team.avatar ? `${team.avatar} ` : ''}{team.name}
                  {(team.streak ?? 0) >= 2 && <span className="ml-1 text-sm">🔥{team.streak}</span>}
                </span>
                <span className="scoreboard-digit font-display text-3xl">{team.score}</span>
              </div>
            ))}
          </div>
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

      {buzzerPanelOpen && game.buzzerRoomCode && (
        <BuzzerPanel code={game.buzzerRoomCode} teams={game.teams} roster={buzzRoster} iced={buzzIced} onClose={() => setBuzzerPanelOpen(false)} />
      )}
    </div>
  )
}
