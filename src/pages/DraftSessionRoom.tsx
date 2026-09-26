import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { DraftBoard, DraftPoolSong, Drafter } from '../types/draft'
import { snakeOrder, computeDraftStandings } from '../types/draft'
import { getDraftBoard, saveDraftBoard } from '../lib/storage/draft-repository'
import Spinner from '../components/Spinner'

function DrafterRoster({ drafter, songs, highlight }: { drafter: Drafter; songs: DraftPoolSong[]; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600 bg-arena-800/60'}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold" style={{ color: drafter.color }}>
        {drafter.avatar ? `${drafter.avatar} ` : ''}
        {drafter.name}
      </div>
      {songs.length === 0 ? (
        <p className="text-xs text-slate-500">No picks yet</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-300">
          {songs.map((song) => (
            <li key={song.id} className="truncate">
              {song.title} <span className="text-slate-500">— {song.artist}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function DraftSessionRoom() {
  const { boardId, sessionId } = useParams()
  const [board, setBoard] = useState<DraftBoard | null>(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [ballotOrder, setBallotOrder] = useState<string[]>([])

  useEffect(() => {
    if (!boardId) return
    setBoard(getDraftBoard(boardId))
  }, [boardId])

  const session = board?.sessions.find((s) => s.id === sessionId)

  function persist(next: DraftBoard) {
    setBoard(saveDraftBoard(next))
  }

  const drafterCount = session?.drafters.length ?? 0
  const order = useMemo(() => (session ? snakeOrder(drafterCount, session.picksPerDrafter) : []), [session, drafterCount])
  const totalPicks = session ? drafterCount * session.picksPerDrafter : 0
  const currentPickNumber = session?.picks.length ?? 0
  const currentDrafterIndex = order[currentPickNumber]
  const currentDrafter = session && currentDrafterIndex !== undefined ? session.drafters[currentDrafterIndex] : undefined
  const currentRound = session ? Math.floor(currentPickNumber / drafterCount) + 1 : 1

  const availableSongs = useMemo(() => board?.songPool.filter((s) => !s.takenBySessionId) ?? [], [board])
  const filteredSongs = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return availableSongs
    return availableSongs.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
  }, [availableSongs, filterQuery])

  function rosterFor(drafterId: string): DraftPoolSong[] {
    if (!board || !session) return []
    const songIds = session.picks.filter((p) => p.drafterId === drafterId).map((p) => p.songId)
    return songIds.map((id) => board.songPool.find((s) => s.id === id)).filter((s): s is DraftPoolSong => !!s)
  }

  function pickSong(song: DraftPoolSong) {
    if (!board || !session || !currentDrafter) return
    persist({
      ...board,
      songPool: board.songPool.map((s) => (s.id === song.id ? { ...s, takenBySessionId: session.id, takenByDrafterId: currentDrafter.id } : s)),
      sessions: board.sessions.map((s) =>
        s.id === session.id
          ? {
              ...s,
              picks: [...s.picks, { songId: song.id, drafterId: currentDrafter.id, round: currentRound }],
              phase: s.picks.length + 1 >= totalPicks ? 'ranking' : s.phase,
            }
          : s,
      ),
    })
  }

  // Ranking phase: whoever in the drafter list hasn't submitted a ballot yet goes next —
  // no separate "turn order" state needed, it's fully derivable from session.rankings.
  const nextRanker = session?.drafters.find((d) => !session.rankings.some((r) => r.drafterId === d.id))
  const otherDrafterIds = useMemo(
    () => (session && nextRanker ? session.drafters.filter((d) => d.id !== nextRanker.id).map((d) => d.id) : []),
    [session, nextRanker],
  )

  useEffect(() => {
    setBallotOrder(otherDrafterIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextRanker?.id])

  function moveBallotEntry(index: number, direction: -1 | 1) {
    setBallotOrder((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function submitBallot() {
    if (!board || !session || !nextRanker) return
    const rankings = [...session.rankings, { drafterId: nextRanker.id, rankedDrafterIds: ballotOrder }]
    const allDone = rankings.length >= session.drafters.length
    persist({
      ...board,
      sessions: board.sessions.map((s) =>
        s.id === session.id
          ? { ...s, rankings, phase: allDone ? 'complete' : 'ranking', completedAt: allDone ? new Date().toISOString() : s.completedAt }
          : s,
      ),
    })
  }

  if (!board || !session) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-slate-400">
        {boardId ? (
          <>
            <Spinner />
            <span>Loading…</span>
          </>
        ) : (
          'Draft session not found.'
        )}
      </div>
    )
  }

  return (
    <div className="min-h-svh court-lines px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <Link to={`/drafts/${board.id}`} className="text-2xl text-hardwood-400 hover:text-hardwood-300">
            ←
          </Link>
          <div>
            <div className="font-display text-2xl tracking-wide text-white">{session.name}</div>
            <div className="text-xs text-slate-500">{board.name}</div>
          </div>
        </div>

        {session.phase === 'drafting' && currentDrafter && (
          <>
            <div className="rounded-xl border border-hardwood-500 bg-hardwood-500/10 px-5 py-3 text-center">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Round {currentRound} of {session.picksPerDrafter} · Pick {currentPickNumber + 1} of {totalPicks}
              </div>
              <div className="font-display text-2xl tracking-wide" style={{ color: currentDrafter.color }}>
                {currentDrafter.avatar ? `${currentDrafter.avatar} ` : ''}
                {currentDrafter.name.toUpperCase()}'S PICK
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {session.drafters.map((drafter) => (
                <DrafterRoster key={drafter.id} drafter={drafter} songs={rosterFor(drafter.id)} highlight={drafter.id === currentDrafter.id} />
              ))}
            </div>

            <div>
              <input
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter by title or artist…"
                className="mb-3 w-full rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-slate-100 outline-none focus:border-hardwood-500"
              />
              {filteredSongs.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No songs left matching "{filterQuery}".</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {filteredSongs.map((song) => (
                    <button
                      key={song.id}
                      onClick={() => pickSong(song)}
                      className="flex flex-col overflow-hidden rounded-xl border border-arena-600 bg-arena-800 text-left hover:border-hardwood-500"
                    >
                      <div className="aspect-square w-full bg-arena-700">
                        {song.artworkUrl ? <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" /> : (
                          <div className="flex h-full w-full items-center justify-center text-3xl text-arena-500">♪</div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <div className="truncate text-sm font-semibold text-slate-100">{song.title}</div>
                        <div className="truncate text-xs text-slate-400">{song.artist}</div>
                        {(song.soundcloudUrl || song.spotifyUrl) && (
                          <a
                            href={song.soundcloudUrl || song.spotifyUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 inline-block text-xs text-hardwood-400 hover:text-hardwood-300"
                          >
                            Listen ↗
                          </a>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {session.phase === 'ranking' && nextRanker && (
          <div className="space-y-4">
            <div className="rounded-xl border border-hardwood-500 bg-hardwood-500/10 px-5 py-3 text-center">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Ranking · {session.rankings.length} of {session.drafters.length} submitted
              </div>
              <div className="font-display text-2xl tracking-wide" style={{ color: nextRanker.color }}>
                {nextRanker.avatar ? `${nextRanker.avatar} ` : ''}
                {nextRanker.name.toUpperCase()}, RANK EVERYONE ELSE
              </div>
              <p className="mt-1 text-sm text-slate-400">Best roster at the top, worst at the bottom.</p>
            </div>

            <div className="space-y-2">
              {ballotOrder.map((drafterId, i) => {
                const drafter = session.drafters.find((d) => d.id === drafterId)
                if (!drafter) return null
                return (
                  <div key={drafterId} className="flex items-center gap-3 rounded-xl border border-arena-600 bg-arena-800/60 p-3">
                    <div className="flex shrink-0 flex-col">
                      <button
                        onClick={() => moveBallotEntry(i, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${drafter.name} up`}
                        className="text-slate-500 hover:text-slate-200 disabled:opacity-20"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveBallotEntry(i, 1)}
                        disabled={i === ballotOrder.length - 1}
                        aria-label={`Move ${drafter.name} down`}
                        className="text-slate-500 hover:text-slate-200 disabled:opacity-20"
                      >
                        ▼
                      </button>
                    </div>
                    <span className="w-6 shrink-0 text-center font-display text-lg text-slate-500">#{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-semibold" style={{ color: drafter.color }}>
                        {drafter.avatar ? `${drafter.avatar} ` : ''}
                        {drafter.name}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {rosterFor(drafterId).map((s) => s.title).join(' · ')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <button onClick={submitBallot} className="w-full rounded-full bg-hardwood-500 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400">
              SUBMIT BALLOT →
            </button>
          </div>
        )}

        {session.phase === 'complete' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="font-display text-4xl tracking-widest text-hardwood-400">FINAL STANDINGS</div>
            </div>
            <div className="space-y-2">
              {computeDraftStandings(session).map((standing, i) => (
                <div key={standing.drafterId} className="flex items-center justify-between rounded-xl border border-arena-600 bg-arena-800/70 p-4">
                  <div className="flex items-center gap-2 font-display text-lg" style={{ color: standing.color }}>
                    {i === 0 ? '🏆 ' : ''}
                    {standing.avatar ? `${standing.avatar} ` : ''}
                    {standing.name}
                  </div>
                  <div className="scoreboard-digit font-display text-2xl text-slate-100">{standing.points} pts</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {session.drafters.map((drafter) => (
                <DrafterRoster key={drafter.id} drafter={drafter} songs={rosterFor(drafter.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
