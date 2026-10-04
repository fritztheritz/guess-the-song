import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { DraftBoard, DraftPoolSong, Drafter } from '../types/draft'
import { snakeOrder, computeDraftStandings } from '../types/draft'
import { getDraftBoard, saveDraftBoard } from '../lib/storage/draft-repository'
import { useConfirm } from '../state/confirm-context'
import { useToast } from '../state/toast-context'
import { useSoundCloud } from '../state/soundcloud-context'
import { useFeatureFlag } from '../state/feature-flags-context'
import { isSoundCloudConfigured } from '../lib/soundcloud/config'
import { createSoundCloudPlaylist } from '../lib/soundcloud/soundcloud-tracks'
import { TrackNotPlayableError } from '../lib/soundcloud/soundcloud-playback'
import { useSoundCloudPreview, type PreviewableTrack } from '../lib/soundcloud/use-soundcloud-preview'
import { buildDraftResultsShareUrl } from '../lib/draft-share'
import Spinner from '../components/Spinner'
import DialogShell from '../components/ui/DialogShell'
import TextInput from '../components/ui/TextInput'
import Button from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import DrafterRoster from '../components/DrafterRoster'
import DraftTurnBanner from '../components/DraftTurnBanner'
import RosterStrip from '../components/RosterStrip'
import DraftPickPool from '../components/DraftPickPool'
import FinalPodium from '../components/FinalPodium'
import NowPlayingBar from '../components/NowPlayingBar'

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
  onCreate: (title: string, sharing: 'public' | 'private') => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(defaultTitle)
  const [sharing, setSharing] = useState<'public' | 'private'>('private')
  return (
    <DialogShell onClose={onClose} closeOnBackdrop={!creating}>
      <h2 className="font-display text-xl tracking-wide text-hardwood-400">NAME THE PLAYLIST</h2>
      <p className="mt-1 text-sm text-slate-400">
        {songCount} song{songCount === 1 ? '' : 's'} will be added to SoundCloud.
      </p>
      <TextInput value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="mt-4 w-full" />
      <div className="mt-4 flex gap-2 rounded-lg border border-arena-600 bg-arena-800 p-1 text-xs">
        <button
          onClick={() => setSharing('private')}
          className={`flex-1 rounded-md py-1.5 ${sharing === 'private' ? 'bg-arena-700 text-white' : 'text-slate-400'}`}
        >
          🔒 Private
        </button>
        <button
          onClick={() => setSharing('public')}
          className={`flex-1 rounded-md py-1.5 ${sharing === 'public' ? 'bg-arena-700 text-white' : 'text-slate-400'}`}
        >
          🌐 Public
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        {sharing === 'private'
          ? 'Only you can open it on SoundCloud — matches your tracks. Listening on this screen works either way.'
          : 'Anyone can find and play it on SoundCloud.'}
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={creating} className="flex-1">
          Cancel
        </Button>
        {/* SoundCloud's own brand orange, not the app's hardwood accent — deliberate, this is a
            SoundCloud-branded action (creating a real playlist in their product). */}
        <button
          onClick={() => onCreate(title.trim() || defaultTitle, sharing)}
          disabled={creating || !title.trim()}
          className="flex-[2] rounded-full bg-[#ff5500] py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#ff7733]"
        >
          {creating ? 'Creating…' : '🎵 Create Playlist'}
        </button>
      </div>
    </DialogShell>
  )
}

export default function DraftSessionRoom() {
  const { boardId, sessionId } = useParams()
  const confirm = useConfirm()
  const showToast = useToast()
  const soundcloud = useSoundCloud()
  // Still being worked through (see feature-flags.ts) — playback via the connected account
  // isn't confirmed working yet, so this stays off by default until that's sorted out.
  const soundcloudPlaylistsEnabled = useFeatureFlag('draft-soundcloud-playlists') && isSoundCloudConfigured()
  const [board, setBoard] = useState<DraftBoard | null>(null)
  const [ballotOrder, setBallotOrder] = useState<string[]>([])
  const [playlistModalDrafterId, setPlaylistModalDrafterId] = useState<string | null>(null)
  const [creatingPlaylistId, setCreatingPlaylistId] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const { previewingKey: previewingSongId, toggle: togglePreviewTrack } = useSoundCloudPreview((err) =>
    showToast(err instanceof TrackNotPlayableError ? err.message : 'Could not play that track'),
  )

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

  function rosterFor(drafterId: string): DraftPoolSong[] {
    if (!board || !session) return []
    const songIds = session.picks.filter((p) => p.drafterId === drafterId).map((p) => p.songId)
    return songIds.map((id) => board.songPool.find((s) => s.id === id)).filter((s): s is DraftPoolSong => !!s)
  }

  // Reads fresh from storage rather than closing over the `board`/`session` state bound at
  // render time — two picks fired back-to-back (fast double-click/tap) before React re-renders
  // would otherwise both compute their write from the same stale picks list, and the second
  // persist() would silently overwrite the first. Re-deriving whose turn it is from the latest
  // picks (instead of the outer currentDrafter/currentRound closures) keeps the two picks
  // correctly attributed to different drafters/rounds instead of both landing on the same one.
  function pickSong(song: DraftPoolSong) {
    if (!boardId || !sessionId) return
    const latestBoard = getDraftBoard(boardId)
    const latestSession = latestBoard?.sessions.find((s) => s.id === sessionId)
    if (!latestBoard || !latestSession) return
    if (latestBoard.songPool.find((s) => s.id === song.id)?.takenBySessionId) return
    const pickNumber = latestSession.picks.length
    const drafters = latestSession.drafters
    const drafterIndex = snakeOrder(drafters.length, latestSession.picksPerDrafter)[pickNumber]
    const drafter = drafterIndex !== undefined ? drafters[drafterIndex] : undefined
    if (!drafter) return
    const round = Math.floor(pickNumber / drafters.length) + 1
    const total = drafters.length * latestSession.picksPerDrafter
    persist({
      ...latestBoard,
      songPool: latestBoard.songPool.map((s) => (s.id === song.id ? { ...s, takenBySessionId: sessionId, takenByDrafterId: drafter.id } : s)),
      sessions: latestBoard.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              picks: [...s.picks, { songId: song.id, drafterId: drafter.id, round }],
              phase: pickNumber + 1 >= total ? 'listening' : s.phase,
            }
          : s,
      ),
    })
  }

  // The whole draft in pick order — what "Play all" and the now-playing bar step through.
  const listenQueue = useMemo(() => {
    if (!board || !session) return []
    return session.picks
      .map((p) => board.songPool.find((s) => s.id === p.songId))
      .filter((s): s is DraftPoolSong => !!s && s.source === 'soundcloud' && !!s.soundcloudTrackId)
  }, [board, session])

  function soundcloudSongsFor(drafterId: string): DraftPoolSong[] {
    return rosterFor(drafterId).filter((s) => s.source === 'soundcloud' && s.soundcloudTrackId)
  }

  // Plays through a drafter's own picks via this app's authenticated SoundCloud connection —
  // works for private tracks, unlike SoundCloud's embeddable widget (which flatly refuses
  // private/secret-token content, confirmed directly against their API: a public track 200s at
  // w.soundcloud.com/player, the same private content 404s there even with a valid secret token,
  // while their own metadata API resolves it fine). Auto-advances through the rest of that
  // drafter's roster on end, so clicking one song plays the "set" much like a real playlist would.
  function toPreviewableTrack(song: DraftPoolSong): PreviewableTrack {
    return { key: song.id, soundcloudTrackId: song.soundcloudTrackId ?? '', soundcloudSecretToken: song.soundcloudSecretToken }
  }

  function togglePreviewSong(queue: DraftPoolSong[], song: DraftPoolSong) {
    togglePreviewTrack(toPreviewableTrack(song), queue.map(toPreviewableTrack))
  }

  const nowPlayingIndex = previewingSongId ? listenQueue.findIndex((s) => s.id === previewingSongId) : -1
  const nowPlaying = nowPlayingIndex >= 0 ? listenQueue[nowPlayingIndex] : undefined
  const nowPlayingDrafter = nowPlaying
    ? session?.drafters.find((d) => d.id === session.picks.find((p) => p.songId === nowPlaying.id)?.drafterId)
    : undefined

  async function handleCreatePlaylistFor(drafterId: string, title: string, sharing: 'public' | 'private') {
    if (!board || !session) return
    const drafter = session.drafters.find((d) => d.id === drafterId)
    const songs = soundcloudSongsFor(drafterId)
    if (!drafter || songs.length === 0) return
    setCreatingPlaylistId(drafterId)
    try {
      const trackIds = songs.map((s) => s.soundcloudTrackId as string)
      const playlist = await createSoundCloudPlaylist(title, trackIds, sharing)
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

  async function resetPlaylistFor(drafterId: string) {
    if (!board || !session) return
    const drafter = session.drafters.find((d) => d.id === drafterId)
    if (!drafter) return
    const ok = await confirm(`Forget ${drafter.name}'s playlist link? The playlist itself stays on SoundCloud — this just lets you create a fresh link.`)
    if (!ok) return
    persist({
      ...board,
      sessions: board.sessions.map((s) =>
        s.id === session.id
          ? { ...s, drafters: s.drafters.map((d) => (d.id === drafterId ? { ...d, soundcloudPlaylistUrl: undefined } : d)) }
          : s,
      ),
    })
  }

  // Standings are only meaningful (and only computed) once the draft is done.
  const standings = useMemo(() => (session?.phase === 'complete' ? computeDraftStandings(session) : []), [session])

  // A plain-text recap for pasting into a chat: final standings, then each drafter's picks.
  async function copyResultsText() {
    if (!session) return
    const medals = ['🥇', '🥈', '🥉']
    const text = [
      `${session.name} — final standings`,
      ...standings.map((st, i) => `${medals[i] ?? `${i + 1}.`} ${st.name} — ${st.points} pts\n   ${rosterFor(st.drafterId).map((s) => s.title).join(' · ')}`),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      showToast('Results copied to clipboard!')
    } catch {
      showToast('Could not copy results.')
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

  const [dragIndex, setDragIndex] = useState<number | null>(null)

  function moveBallotTo(from: number, to: number) {
    setBallotOrder((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function moveBallotEntry(index: number, direction: -1 | 1) {
    setBallotOrder((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function openPresentation() {
    // Built off the current URL (not a hand-written absolute path) so it works unchanged
    // under GitHub Pages' /guess-the-song/ base path — same approach as Game Present mode's
    // "Public Display" button.
    window.open(`${window.location.href.replace(/\/$/, '')}/present`, `gts-draft-present-${sessionId}`, 'noopener')
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to={`/drafts/${board.id}`} className="text-2xl text-hardwood-400 hover:text-hardwood-300">
              ←
            </Link>
            <div>
              <div className="font-display text-2xl tracking-wide text-white">{session.name}</div>
              <div className="text-xs text-slate-500">{board.name}</div>
            </div>
          </div>
          <button
            onClick={openPresentation}
            className="shrink-0 rounded-full border border-arena-500 px-4 py-1.5 text-sm text-slate-300 hover:border-hardwood-500"
          >
            🖥️ Present
          </button>
        </div>

        {session.phase === 'drafting' && currentDrafter && (
          <>
            <DraftTurnBanner
              round={currentRound}
              rounds={session.picksPerDrafter}
              pickNumber={currentPickNumber}
              totalPicks={totalPicks}
              drafter={currentDrafter}
              onDeck={onDeck}
              onUndo={canUndoPick ? undoLastPick : undefined}
            />

            <RosterStrip
              drafters={session.drafters}
              rosterFor={rosterFor}
              picksPerDrafter={session.picksPerDrafter}
              currentDrafterId={currentDrafter.id}
            />

            <DraftPickPool songs={availableSongs} totalAvailable={availableSongs.length} drafter={currentDrafter} onPick={pickSong} />
          </>
        )}

        {session.phase === 'listening' && (
          <div className="space-y-6">
            <div className="relative rounded-xl border border-hardwood-500 bg-hardwood-500/10 px-5 py-4 text-center">
              <div className="font-display text-3xl tracking-widest text-hardwood-400">🎧 LISTENING TIME!</div>
              <p className="mt-1 text-sm text-slate-400">Everyone's picks are in. Give the whole draft a listen before ranking.</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {soundcloudPlaylistsEnabled && soundcloud.connection && listenQueue.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => togglePreviewSong(listenQueue, listenQueue[0])}>
                    ▶ Play all in pick order
                  </Button>
                )}
                {canUndoPick && (
                  <button
                    onClick={undoLastPick}
                    className="rounded-full border border-arena-500 px-3 py-1 text-xs text-slate-300 hover:border-hardwood-400 hover:text-hardwood-300"
                  >
                    ↩ Undo Last Pick
                  </button>
                )}
              </div>
            </div>

            {soundcloudPlaylistsEnabled && !soundcloud.connection && (
              <Panel className="text-center">
                <p className="mb-2 text-sm text-slate-400">Connect SoundCloud to listen along and save a playlist per drafter.</p>
                {/* SoundCloud's own brand orange, not the app's hardwood accent — deliberate. */}
                <button
                  onClick={() => soundcloud.connect()}
                  className="rounded-full border border-[#ff5500] px-5 py-2 font-semibold text-[#ff7733] hover:bg-[#ff5500]/10"
                >
                  Connect SoundCloud
                </button>
              </Panel>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {session.drafters.map((drafter) => {
                const songs = rosterFor(drafter.id)
                return (
                  <DrafterRoster
                    key={drafter.id}
                    drafter={drafter}
                    songs={songs}
                    onCreatePlaylist={
                      soundcloudPlaylistsEnabled && soundcloud.connection ? () => setPlaylistModalDrafterId(drafter.id) : undefined
                    }
                    createDisabledReason={
                      soundcloudSongsFor(drafter.id).length === 0 ? "None of this drafter's picks are SoundCloud tracks, so there's nothing to put in a playlist" : undefined
                    }
                    onResetPlaylist={soundcloudPlaylistsEnabled && soundcloud.connection ? () => resetPlaylistFor(drafter.id) : undefined}
                    onPreviewSong={
                      soundcloudPlaylistsEnabled && soundcloud.connection ? (song) => togglePreviewSong(listenQueue.length > 0 ? listenQueue : songs, song) : undefined
                    }
                    previewingSongId={previewingSongId}
                  />
                )
              })}
            </div>

            <NowPlayingBar
              song={nowPlaying}
              drafter={nowPlayingDrafter}
              index={nowPlayingIndex + 1}
              total={listenQueue.length}
              onPrev={() => nowPlayingIndex > 0 && togglePreviewSong(listenQueue, listenQueue[nowPlayingIndex - 1])}
              onNext={() => nowPlayingIndex < listenQueue.length - 1 && togglePreviewSong(listenQueue, listenQueue[nowPlayingIndex + 1])}
              onStop={() => nowPlaying && togglePreviewSong(listenQueue, nowPlaying)}
            />

            <Button
              onClick={() => persist({ ...board, sessions: board.sessions.map((s) => (s.id === session.id ? { ...s, phase: 'ranking' } : s)) })}
              fullWidth
            >
              START RANKING →
            </Button>
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
              <p className="mt-1 text-sm text-slate-400">Best roster at the top, worst at the bottom — drag to reorder, or use the arrows.</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5" aria-label="Ballots submitted">
                {session.drafters.map((d) => {
                  const done = session.rankings.some((r) => r.drafterId === d.id)
                  return (
                    <span
                      key={d.id}
                      className={`rounded-full px-2.5 py-0.5 text-xs ${done ? 'bg-scoreboard-green/15 text-scoreboard-green' : d.id === nextRanker.id ? 'bg-hardwood-500/20 text-hardwood-300' : 'bg-arena-800 text-slate-500'}`}
                    >
                      {done ? '✓ ' : d.id === nextRanker.id ? '✎ ' : ''}
                      {d.name}
                    </span>
                  )
                })}
              </div>
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
                  <Panel
                    key={drafterId}
                    padding="sm"
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) moveBallotTo(dragIndex, i)
                      setDragIndex(null)
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    className={`flex items-center gap-3 ${dragIndex === i ? 'opacity-40' : ''}`}
                  >
                    <span className="shrink-0 cursor-grab text-slate-600 active:cursor-grabbing" aria-hidden title="Drag to reorder">
                      ⠿
                    </span>
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
                  </Panel>
                )
              })}
            </div>

            <Button onClick={submitBallot} fullWidth>
              SUBMIT BALLOT →
            </Button>
          </div>
        )}

        {session.phase === 'complete' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="font-display text-4xl tracking-widest text-hardwood-400">FINAL STANDINGS</div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" onClick={handleShareResults} disabled={sharing}>
                  {sharing ? 'Generating link…' : '🔗 Share Results'}
                </Button>
                <Button variant="outline" onClick={copyResultsText}>
                  📋 Copy results
                </Button>
              </div>
              {shareUrl && (
                <TextInput
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  inputSize="sm"
                  className="w-full max-w-md text-center text-xs"
                />
              )}
            </div>
            <FinalPodium teams={standings.map((st) => ({ id: st.drafterId, name: st.name, color: st.color, avatar: st.avatar, score: st.points }))} />
            <div className="mx-auto max-w-xl space-y-1 text-center text-xs text-slate-500">
              {standings.map((st, i) => (
                <div key={st.drafterId}>
                  {i + 1}. <span style={{ color: st.color }}>{st.name}</span> — {st.points} pts
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
              onCreate={(title, sharing) => handleCreatePlaylistFor(drafter.id, title, sharing)}
              onClose={() => setPlaylistModalDrafterId(null)}
            />
          )
        })()}
    </div>
  )
}
