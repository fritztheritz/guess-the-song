import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { DraftBoard, DraftPoolSong, Drafter } from '../types/draft'
import { snakeOrder, computeDraftStandings } from '../types/draft'
import { getDraftBoard, saveDraftBoard } from '../lib/storage/draft-repository'
import { useConfirm } from '../state/ConfirmContext'
import { useToast } from '../state/ToastContext'
import { useSoundCloud } from '../state/SoundCloudContext'
import { isSoundCloudConfigured } from '../lib/soundcloud/config'
import { createSoundCloudPlaylist } from '../lib/soundcloud/soundcloud-tracks'
import { buildDraftResultsShareUrl } from '../lib/draft-share'
import Spinner from '../components/Spinner'

// SoundCloud's widget accepts any playlist permalink (private ones included, since the
// permalink already carries its own secret_token query param) — no oEmbed round-trip needed,
// just build the iframe src directly.
function soundCloudWidgetSrc(playlistUrl: string): string {
  const params = new URLSearchParams({
    url: playlistUrl,
    color: 'ff5500',
    auto_play: 'false',
    show_comments: 'false',
    visual: 'false',
  })
  return `https://w.soundcloud.com/player/?${params.toString()}`
}

function DrafterRoster({
  drafter,
  songs,
  highlight,
  onCreatePlaylist,
  showPlayer,
}: {
  drafter: Drafter
  songs: DraftPoolSong[]
  highlight?: boolean
  /** Opens the naming modal. Only passed on the listening screen, and only when the drafter
   *  has an eligible song. */
  onCreatePlaylist?: () => void
  /** Renders the embedded SoundCloud player when a playlist exists. Only passed on the
   *  listening screen — keeps the roster grid compact everywhere else. */
  showPlayer?: boolean
}) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600 bg-arena-800/60'}`}>
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 truncate text-sm font-semibold" style={{ color: drafter.color }}>
          {drafter.avatar ? `${drafter.avatar} ` : ''}
          {drafter.name}
        </div>
        {drafter.soundcloudPlaylistUrl ? (
          <a
            href={drafter.soundcloudPlaylistUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs text-[#ff7733] hover:text-[#ff5500]"
          >
            🎵 Playlist ↗
          </a>
        ) : (
          onCreatePlaylist && (
            <button onClick={onCreatePlaylist} className="shrink-0 text-xs text-slate-400 hover:text-[#ff7733]">
              🎵 Create
            </button>
          )
        )}
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
      {showPlayer && drafter.soundcloudPlaylistUrl && (
        <iframe
          title={`${drafter.name}'s playlist`}
          className="mt-2 w-full rounded-md"
          height="120"
          src={soundCloudWidgetSrc(drafter.soundcloudPlaylistUrl)}
          allow="autoplay"
        />
      )}
    </div>
  )
}

function CreatePlaylistModal({
  defaultTitle,
  songCount,
  creating,
  onCreate,
  onClose,
}: {
  defaultTitle: string
  songCount: number
  creating: boolean
  onCreate: (title: string) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(defaultTitle)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-arena-600 bg-arena-900 p-6 shadow-2xl">
        <h2 className="font-display text-xl tracking-wide text-hardwood-400">NAME THE PLAYLIST</h2>
        <p className="mt-1 text-sm text-slate-400">
          {songCount} song{songCount === 1 ? '' : 's'} will be added to SoundCloud.
        </p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          className="mt-4 w-full rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-slate-100 outline-none focus:border-hardwood-500"
        />
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={creating}
            className="flex-1 rounded-full border border-arena-500 py-2 text-sm text-slate-300 disabled:opacity-40 hover:border-hardwood-500"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(title.trim() || defaultTitle)}
            disabled={creating || !title.trim()}
            className="flex-[2] rounded-full bg-[#ff5500] py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#ff7733]"
          >
            {creating ? 'Creating…' : '🎵 Create Playlist'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DraftSessionRoom() {
  const { boardId, sessionId } = useParams()
  const confirm = useConfirm()
  const showToast = useToast()
  const soundcloud = useSoundCloud()
  const [board, setBoard] = useState<DraftBoard | null>(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [ballotOrder, setBallotOrder] = useState<string[]>([])
  const [playlistModalDrafterId, setPlaylistModalDrafterId] = useState<string | null>(null)
  const [creatingPlaylistId, setCreatingPlaylistId] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

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
  const onDeck = useMemo(
    () =>
      session
        ? order
            .slice(currentPickNumber + 1, currentPickNumber + 5)
            .map((i) => session.drafters[i])
            .filter((d): d is Drafter => !!d)
        : [],
    [session, order, currentPickNumber],
  )

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
              phase: s.picks.length + 1 >= totalPicks ? 'listening' : s.phase,
            }
          : s,
      ),
    })
  }

  function soundcloudSongsFor(drafterId: string): DraftPoolSong[] {
    return rosterFor(drafterId).filter((s) => s.source === 'soundcloud' && s.soundcloudTrackId)
  }

  async function handleCreatePlaylistFor(drafterId: string, title: string) {
    if (!board || !session) return
    const drafter = session.drafters.find((d) => d.id === drafterId)
    const songs = soundcloudSongsFor(drafterId)
    if (!drafter || songs.length === 0) return
    setCreatingPlaylistId(drafterId)
    try {
      const trackIds = songs.map((s) => s.soundcloudTrackId as string)
      const playlist = await createSoundCloudPlaylist(title, trackIds)
      persist({
        ...board,
        sessions: board.sessions.map((s) =>
          s.id === session.id
            ? { ...s, drafters: s.drafters.map((d) => (d.id === drafterId ? { ...d, soundcloudPlaylistUrl: playlist.permalinkUrl } : d)) }
            : s,
        ),
      })
      showToast(`Playlist created for ${drafter.name}`)
      setPlaylistModalDrafterId(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create the playlist')
    } finally {
      setCreatingPlaylistId(null)
    }
  }

  async function handleShareResults() {
    if (!board || !session) return
    setSharing(true)
    try {
      const url = await buildDraftResultsShareUrl(board, session)
      setShareUrl(url)
      try {
        await navigator.clipboard.writeText(url)
        showToast('Link copied to clipboard!')
      } catch {
        showToast('Could not copy — select the link below.')
      }
    } catch {
      showToast('Could not generate a share link.')
    } finally {
      setSharing(false)
    }
  }

  // Only safe to undo a pick before anyone's started ranking — once a ballot's been submitted
  // it was ranking a specific final roster, so pulling a pick back out from under it would make
  // that ballot stale.
  const canUndoPick = !!board && !!session && session.picks.length > 0 && session.rankings.length === 0

  async function undoLastPick() {
    if (!board || !session || session.picks.length === 0) return
    const lastPick = session.picks[session.picks.length - 1]
    const song = board.songPool.find((s) => s.id === lastPick.songId)
    const drafter = session.drafters.find((d) => d.id === lastPick.drafterId)
    const ok = await confirm(`Undo ${drafter?.name ?? 'this'}'s pick of "${song?.title ?? 'that song'}"?`, { confirmLabel: 'Undo' })
    if (!ok) return
    persist({
      ...board,
      songPool: board.songPool.map((s) => (s.id === lastPick.songId ? { ...s, takenBySessionId: undefined, takenByDrafterId: undefined } : s)),
      sessions: board.sessions.map((s) => (s.id === session.id ? { ...s, picks: s.picks.slice(0, -1), phase: 'drafting' } : s)),
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
            <div className="relative rounded-xl border border-hardwood-500 bg-hardwood-500/10 px-5 py-3 text-center">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Round {currentRound} of {session.picksPerDrafter} · Pick {currentPickNumber + 1} of {totalPicks}
              </div>
              <div className="font-display text-2xl tracking-wide" style={{ color: currentDrafter.color }}>
                {currentDrafter.avatar ? `${currentDrafter.avatar} ` : ''}
                {currentDrafter.name.toUpperCase()}'S PICK
              </div>
              {canUndoPick && (
                <button
                  onClick={undoLastPick}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-arena-500 px-3 py-1 text-xs text-slate-300 hover:border-hardwood-400 hover:text-hardwood-300"
                >
                  ↩ Undo Last Pick
                </button>
              )}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-arena-700">
                <div
                  className="h-full rounded-full bg-hardwood-500 transition-[width]"
                  style={{ width: `${(currentPickNumber / totalPicks) * 100}%` }}
                />
              </div>
              {onDeck.length > 0 && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                  <span className="uppercase tracking-widest">On deck</span>
                  {onDeck.map((drafter, i) => (
                    <span key={i} className="flex items-center gap-1.5">
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

        {session.phase === 'listening' && (
          <div className="space-y-6">
            <div className="relative rounded-xl border border-hardwood-500 bg-hardwood-500/10 px-5 py-4 text-center">
              <div className="font-display text-3xl tracking-widest text-hardwood-400">🎧 LISTENING TIME!</div>
              <p className="mt-1 text-sm text-slate-400">Everyone's picks are in. Give the whole draft a listen before ranking.</p>
              {canUndoPick && (
                <button
                  onClick={undoLastPick}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-arena-500 px-3 py-1 text-xs text-slate-300 hover:border-hardwood-400 hover:text-hardwood-300"
                >
                  ↩ Undo Last Pick
                </button>
              )}
            </div>

            {isSoundCloudConfigured() && !soundcloud.connection && (
              <div className="rounded-xl border border-arena-600 bg-arena-800/60 p-4 text-center">
                <p className="mb-2 text-sm text-slate-400">Connect SoundCloud to build a listening playlist per drafter.</p>
                <button
                  onClick={() => soundcloud.connect()}
                  className="rounded-full border border-[#ff5500] px-5 py-2 font-semibold text-[#ff7733] hover:bg-[#ff5500]/10"
                >
                  Connect SoundCloud
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {session.drafters.map((drafter) => (
                <DrafterRoster
                  key={drafter.id}
                  drafter={drafter}
                  songs={rosterFor(drafter.id)}
                  showPlayer
                  onCreatePlaylist={
                    isSoundCloudConfigured() && soundcloud.connection && soundcloudSongsFor(drafter.id).length > 0
                      ? () => setPlaylistModalDrafterId(drafter.id)
                      : undefined
                  }
                />
              ))}
            </div>

            <button
              onClick={() => persist({ ...board, sessions: board.sessions.map((s) => (s.id === session.id ? { ...s, phase: 'ranking' } : s)) })}
              className="w-full rounded-full bg-hardwood-500 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400"
            >
              START RANKING →
            </button>
          </div>
        )}

        {session.phase === 'ranking' && nextRanker && (
          <div className="space-y-4">
            <div className="relative rounded-xl border border-hardwood-500 bg-hardwood-500/10 px-5 py-3 text-center">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Ranking · {session.rankings.length} of {session.drafters.length} submitted
              </div>
              <div className="font-display text-2xl tracking-wide" style={{ color: nextRanker.color }}>
                {nextRanker.avatar ? `${nextRanker.avatar} ` : ''}
                {nextRanker.name.toUpperCase()}, RANK EVERYONE ELSE
              </div>
              <p className="mt-1 text-sm text-slate-400">Best roster at the top, worst at the bottom.</p>
              {canUndoPick && (
                <button
                  onClick={undoLastPick}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-arena-500 px-3 py-1 text-xs text-slate-300 hover:border-hardwood-400 hover:text-hardwood-300"
                >
                  ↩ Undo Last Pick
                </button>
              )}
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

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleShareResults}
                disabled={sharing}
                className="rounded-full border border-arena-500 px-5 py-2 text-sm text-slate-200 disabled:opacity-40 hover:border-hardwood-500"
              >
                {sharing ? 'Generating link…' : '🔗 Share Results'}
              </button>
              {shareUrl && (
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full max-w-md rounded-lg border border-arena-600 bg-arena-800 px-3 py-1.5 text-center text-xs text-slate-400 outline-none focus:border-hardwood-500"
                />
              )}
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

      {playlistModalDrafterId &&
        (() => {
          const drafter = session.drafters.find((d) => d.id === playlistModalDrafterId)
          if (!drafter) return null
          return (
            <CreatePlaylistModal
              defaultTitle={`${drafter.name} — ${session.name}`}
              songCount={soundcloudSongsFor(drafter.id).length}
              creating={creatingPlaylistId === drafter.id}
              onCreate={(title) => handleCreatePlaylistFor(drafter.id, title)}
              onClose={() => setPlaylistModalDrafterId(null)}
            />
          )
        })()}
    </div>
  )
}
