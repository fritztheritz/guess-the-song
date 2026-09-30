import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { DraftBoard, DraftPoolSong, Drafter } from '../types/draft'
import { snakeOrder, computeDraftStandings } from '../types/draft'
import { getDraftBoard } from '../lib/storage/draft-repository'
import { playCorrect, playFanfare } from '../lib/sound-effects'
import SoundControl from '../components/SoundControl'
import Spinner from '../components/Spinner'
import Confetti from '../components/Confetti'

const DRAFT_STORAGE_KEY = 'gts.draftboards.v1'

// The read-only "big screen" for a draft, opened in a second tab/window alongside the
// control room (same split as Game Present mode's HostController/PublicDisplay, but
// simpler: draft state is small and already round-trips through localStorage, so this
// just re-reads it on the native cross-tab `storage` event instead of needing its own
// BroadcastChannel sync protocol).
export default function DraftPresentation() {
  const { boardId, sessionId } = useParams()
  const [board, setBoard] = useState<DraftBoard | null>(null)
  const [lastPick, setLastPick] = useState<{ song: DraftPoolSong; drafter: Drafter } | null>(null)
  const [celebrating, setCelebrating] = useState(false)
  const prevPickCountRef = useRef<number | null>(null)
  const prevPhaseRef = useRef<string | null>(null)

  useEffect(() => {
    if (!boardId) return
    function load() {
      setBoard(getDraftBoard(boardId!))
    }
    load()
    // `storage` only fires in OTHER tabs than the one that wrote — exactly what's wanted
    // here, since the control room tab is where every pick/phase change actually happens.
    function onStorage(e: StorageEvent) {
      if (!e.key || e.key === DRAFT_STORAGE_KEY) load()
    }
    // Belt-and-suspenders for the rare case a `storage` event gets missed (e.g. the display
    // tab was asleep/backgrounded) — catch up as soon as it's actually looked at again.
    function onVisible() {
      if (document.visibilityState === 'visible') load()
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [boardId])

  const session = board?.sessions.find((s) => s.id === sessionId)

  const drafterCount = session?.drafters.length ?? 0
  const order = session ? snakeOrder(drafterCount, session.picksPerDrafter) : []
  const totalPicks = session ? drafterCount * session.picksPerDrafter : 0
  const currentPickNumber = session?.picks.length ?? 0
  const currentDrafterIndex = order[currentPickNumber]
  const currentDrafter = session && currentDrafterIndex !== undefined ? session.drafters[currentDrafterIndex] : undefined
  const currentRound = session ? Math.floor(currentPickNumber / drafterCount) + 1 : 1
  const onDeck = session
    ? order
        .slice(currentPickNumber + 1, currentPickNumber + 5)
        .map((i) => session.drafters[i])
        .filter((d): d is Drafter => !!d)
    : []

  function rosterFor(drafterId: string): DraftPoolSong[] {
    if (!board || !session) return []
    const songIds = session.picks.filter((p) => p.drafterId === drafterId).map((p) => p.songId)
    return songIds.map((id) => board.songPool.find((s) => s.id === id)).filter((s): s is DraftPoolSong => !!s)
  }

  // Flashes a "just picked" reveal whenever the picks list grows — skipped on the very
  // first load (prevPickCountRef starts null) so opening this page mid-draft doesn't
  // immediately claim the most recent pick was "just" made.
  useEffect(() => {
    if (!session) return
    const count = session.picks.length
    if (prevPickCountRef.current !== null && count > prevPickCountRef.current) {
      const pick = session.picks[count - 1]
      const song = board?.songPool.find((s) => s.id === pick.songId)
      const drafter = session.drafters.find((d) => d.id === pick.drafterId)
      if (song && drafter) {
        setLastPick({ song, drafter })
        playCorrect()
        const t = setTimeout(() => setLastPick(null), 4000)
        prevPickCountRef.current = count
        return () => clearTimeout(t)
      }
    }
    prevPickCountRef.current = count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.picks.length])

  useEffect(() => {
    if (!session) return
    if (prevPhaseRef.current && prevPhaseRef.current !== 'complete' && session.phase === 'complete') {
      playFanfare()
      setCelebrating(true)
      const t = setTimeout(() => setCelebrating(false), 4000)
      prevPhaseRef.current = session.phase
      return () => clearTimeout(t)
    }
    prevPhaseRef.current = session.phase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.phase])

  if (!board || !session) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-slate-400">
        <Spinner />
        <span>Loading…</span>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col court-lines px-8 py-8">
      {celebrating && <Confetti />}

      <div className="flex items-center justify-between">
        <Link to={`/drafts/${board.id}/sessions/${session.id}`} className="text-sm text-slate-500 hover:text-slate-300">
          ← Control room
        </Link>
        <div className="text-center">
          <div className="font-display text-2xl tracking-wide text-white">{session.name}</div>
          <div className="text-xs text-slate-500">{board.name}</div>
        </div>
        <SoundControl />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
        {lastPick ? (
          <div className="flex flex-col items-center gap-4 text-center animate-pop-in">
            <div className="text-sm uppercase tracking-[0.3em] text-slate-500">Just picked</div>
            <div className="h-40 w-40 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl">
              {lastPick.song.artworkUrl ? (
                <img src={lastPick.song.artworkUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-5xl text-arena-500">♪</div>
              )}
            </div>
            <div>
              <div className="font-display text-3xl text-white">{lastPick.song.title}</div>
              <div className="text-slate-400">{lastPick.song.artist}</div>
            </div>
            <div className="font-display text-xl" style={{ color: lastPick.drafter.color }}>
              {lastPick.drafter.avatar ? `${lastPick.drafter.avatar} ` : ''}
              {lastPick.drafter.name.toUpperCase()}
            </div>
          </div>
        ) : session.phase === 'drafting' && currentDrafter ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Round {currentRound} of {session.picksPerDrafter} · Pick {currentPickNumber + 1} of {totalPicks}
            </div>
            <div className="font-display text-6xl tracking-wide" style={{ color: currentDrafter.color }}>
              {currentDrafter.avatar ? `${currentDrafter.avatar} ` : ''}
              {currentDrafter.name.toUpperCase()}'S PICK
            </div>
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-arena-700">
              <div
                className="h-full rounded-full bg-hardwood-500 transition-[width]"
                style={{ width: `${(currentPickNumber / totalPicks) * 100}%` }}
              />
            </div>
            {onDeck.length > 0 && (
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <span className="uppercase tracking-widest">On deck</span>
                {onDeck.map((drafter, i) => (
                  <span key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-arena-600">→</span>}
                    <span style={{ color: drafter.color }}>
                      {drafter.avatar ? `${drafter.avatar} ` : ''}
                      {drafter.name}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : session.phase === 'listening' ? (
          <div className="text-center">
            <div className="font-display text-5xl tracking-widest text-hardwood-400">🎧 LISTENING TIME</div>
            <p className="mt-2 text-slate-400">Picks are locked — spin through what everyone drafted.</p>
          </div>
        ) : session.phase === 'ranking' ? (
          <div className="text-center">
            <div className="font-display text-5xl tracking-widest text-hardwood-400">📊 RANKING IN PROGRESS</div>
            <p className="mt-2 text-slate-400">
              {session.rankings.length} of {session.drafters.length} ballots submitted
            </p>
          </div>
        ) : (
          <div className="text-center">
            <div className="font-display text-6xl tracking-widest text-hardwood-400">FINAL STANDINGS</div>
            <div className="mt-6 space-y-2">
              {computeDraftStandings(session).map((standing, i) => (
                <div
                  key={standing.drafterId}
                  className="flex w-96 items-center justify-between rounded-xl border border-arena-600 bg-arena-800/70 px-5 py-3"
                >
                  <span className="font-display text-xl" style={{ color: standing.color }}>
                    {i === 0 ? '🏆 ' : ''}
                    {standing.avatar ? `${standing.avatar} ` : ''}
                    {standing.name}
                  </span>
                  <span className="scoreboard-digit font-display text-2xl text-slate-100">{standing.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {session.drafters.map((drafter) => (
          <div key={drafter.id} className="rounded-xl border border-arena-600 bg-arena-800/60 p-3">
            <div className="truncate text-sm font-semibold" style={{ color: drafter.color }}>
              {drafter.avatar ? `${drafter.avatar} ` : ''}
              {drafter.name}
            </div>
            <div className="text-xs text-slate-500">{rosterFor(drafter.id).length} songs</div>
          </div>
        ))}
      </div>
    </div>
  )
}
