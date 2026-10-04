import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { DraftBoard, DraftPoolSong, DraftSession } from '../types/draft'
import { createDraftSession } from '../types/draft'
import { getDraftBoard, saveDraftBoard } from '../lib/storage/draft-repository'
import { useFeatureFlag } from '../state/feature-flags-context'
import { isSpotifyConfigured } from '../lib/spotify/config'
import { useToast } from '../state/toast-context'
import { useConfirm } from '../state/confirm-context'
import ImportSoundCloudModal from '../components/ImportSoundCloudModal'
import ImportSpotifyModal from '../components/ImportSpotifyModal'
import NewDraftSessionModal from '../components/NewDraftSessionModal'
import TagInput from '../components/TagInput'
import Spinner from '../components/Spinner'
import EmptyState from '../components/ui/EmptyState'
import Panel from '../components/ui/Panel'
import Button from '../components/ui/Button'
import type { ImportableTrack } from '../lib/soundcloud/soundcloud-tracks'
import type { ImportableSpotifyTrack } from '../lib/spotify/spotify-tracks'
import { summarizeDraftBoard } from '../lib/draft-summary'
import { useStoredEntity } from '../lib/use-stored-entity'

const PHASE_LABEL: Record<DraftSession['phase'], string> = {
  drafting: '🎧 Drafting',
  listening: '🎶 Listening',
  ranking: '📊 Ranking',
  complete: '✅ Complete',
}

export default function DraftBoardHome() {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const showToast = useToast()
  const confirm = useConfirm()
  const spotifyImportEnabled = useFeatureFlag('spotify-import') && isSpotifyConfigured()
  const [board, setBoard] = useStoredEntity(boardId, getDraftBoard)
  const [importOpen, setImportOpen] = useState(false)
  const [spotifyImportOpen, setSpotifyImportOpen] = useState(false)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  // The pool is reference material, so it starts collapsed and remembers the choice per draft.
  const poolKey = `gts.draft.poolOpen.${boardId}`
  const [poolOpen, setPoolOpen] = useState(() => {
    try {
      return localStorage.getItem(poolKey) === '1'
    } catch {
      return false
    }
  })
  const togglePool = () => {
    const next = !poolOpen
    setPoolOpen(next)
    try {
      localStorage.setItem(poolKey, next ? '1' : '0')
    } catch {
      // Best-effort only.
    }
  }
  const [poolQuery, setPoolQuery] = useState('')
  const [poolFilter, setPoolFilter] = useState<'all' | 'available' | 'taken'>('all')

  const availableSongs = useMemo(() => board?.songPool.filter((s) => !s.takenBySessionId) ?? [], [board])
  const takenSongs = useMemo(() => board?.songPool.filter((s) => s.takenBySessionId) ?? [], [board])

  const visiblePool = useMemo(() => {
    const q = poolQuery.trim().toLowerCase()
    return (board?.songPool ?? []).filter(
      (s) =>
        (poolFilter === 'all' || (poolFilter === 'taken') === !!s.takenBySessionId) &&
        (!q || `${s.title} ${s.artist}`.toLowerCase().includes(q)),
    )
  }, [board, poolQuery, poolFilter])

  function persist(next: DraftBoard) {
    setBoard(saveDraftBoard(next))
  }

  function renameBoard(name: string) {
    if (!board) return
    persist({ ...board, name })
  }

  function updateTags(tags: string[]) {
    if (!board) return
    persist({ ...board, tags })
  }

  function handleImport(tracks: ImportableTrack[]) {
    if (!board) return
    addSongs(tracks.map((t) => ({ id: t.soundcloudTrackId, source: 'soundcloud' as const, ...t })))
  }

  function handleSpotifyImport(tracks: ImportableSpotifyTrack[]) {
    if (!board) return
    addSongs(tracks.map((t) => ({ id: t.spotifyTrackId, source: 'spotify' as const, ...t })))
  }

  function addSongs(songs: DraftPoolSong[]) {
    if (!board) return
    const existingIds = new Set(board.songPool.map((s) => s.id))
    const fresh = songs.filter((s) => !existingIds.has(s.id))
    persist({ ...board, songPool: [...board.songPool, ...fresh] })
    const dupes = songs.length - fresh.length
    showToast(`Added ${fresh.length} song${fresh.length === 1 ? '' : 's'}${dupes > 0 ? ` (${dupes} already in the pool)` : ''}`)
  }

  // Delete-then-offer-Undo instead of a confirm dialog — only ever offered for an untaken
  // pool song (see the render below), so there's nothing else referencing it that Undo
  // could leave dangling. Same pattern as Home.tsx's library deletes and GameBuilder's
  // round removal: Undo re-inserts at the original index and persists off the board as it
  // looks *then*, not a stale closure of it.
  function removeSong(song: DraftPoolSong) {
    if (!board) return
    const index = board.songPool.findIndex((s) => s.id === song.id)
    if (index === -1) return
    persist({ ...board, songPool: board.songPool.filter((s) => s.id !== song.id) })
    showToast(`"${song.title}" removed`, {
      action: {
        label: 'Undo',
        onAction: () => {
          setBoard((prev) => {
            if (!prev) return prev
            const restored = [...prev.songPool]
            restored.splice(Math.min(index, restored.length), 0, song)
            return saveDraftBoard({ ...prev, songPool: restored })
          })
        },
      },
    })
  }

  function handleCreateSession({ name, drafters, picksPerDrafter }: { name: string; drafters: DraftSession['drafters']; picksPerDrafter: number }) {
    if (!board) return
    const session = createDraftSession(name, drafters, picksPerDrafter)
    persist({ ...board, sessions: [...board.sessions, session] })
    setNewSessionOpen(false)
    navigate(`/drafts/${board.id}/sessions/${session.id}`)
  }

  // Deleting a session frees up every song it had taken — otherwise those picks would stay
  // permanently locked out of the shared pool with no session left to point back to.
  async function deleteSession(session: DraftSession) {
    if (!board) return
    const ok = await confirm(`Delete "${session.name}"? This can't be undone — its picks go back into the pool.`, {
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    persist({
      ...board,
      songPool: board.songPool.map((s) =>
        s.takenBySessionId === session.id ? { ...s, takenBySessionId: undefined, takenByDrafterId: undefined } : s,
      ),
      sessions: board.sessions.filter((s) => s.id !== session.id),
    })
  }

  if (!board) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-slate-400">
        {boardId ? (
          <>
            <Spinner />
            <span>Loading…</span>
          </>
        ) : (
          'Draft not found.'
        )}
      </div>
    )
  }

  const summary = summarizeDraftBoard(board)

  return (
    <div className="min-h-svh court-lines px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-2xl text-hardwood-400 hover:text-hardwood-300">
            ←
          </Link>
          <input
            value={board.name}
            onChange={(e) => renameBoard(e.target.value)}
            className="w-full bg-transparent font-display text-3xl tracking-wide text-white outline-none focus:border-b focus:border-hardwood-500"
          />
        </div>

        <div className="-mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="rounded-full border border-arena-600 px-3 py-1">{summary.sessions} session{summary.sessions === 1 ? '' : 's'}</span>
          {summary.inProgress > 0 && <span className="rounded-full border border-hardwood-500/60 px-3 py-1 text-hardwood-300">{summary.inProgress} in progress</span>}
          <span className="rounded-full border border-arena-600 px-3 py-1">{summary.completed} finished</span>
          <span className="rounded-full border border-arena-600 px-3 py-1">
            {summary.songsUsed} of {summary.songsTotal} songs used
          </span>
          {summary.lastPlayed && (
            <span className="rounded-full border border-arena-600 px-3 py-1">last played {new Date(summary.lastPlayed).toLocaleDateString()}</span>
          )}
        </div>

        {/* Sessions come first — they're what you open the draft to get to. The song pool is
            reference material (and can be hundreds of tracks), so it sits below, collapsed by
            default, as a compact searchable list instead of a wall of artwork. */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-display text-xl tracking-wide text-hardwood-400">DRAFT SESSIONS</div>
              <div className="text-xs text-slate-500">
                {board.sessions.length} session{board.sessions.length === 1 ? '' : 's'} · {availableSongs.length} song{availableSongs.length === 1 ? '' : 's'} still available
              </div>
            </div>
            <Button size="sm" onClick={() => setNewSessionOpen(true)} disabled={availableSongs.length === 0}>
              + New Session
            </Button>
          </div>

          {board.sessions.length === 0 ? (
            <EmptyState
              icon="🏀"
              action={
                availableSongs.length === 0 ? (
                  <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                    + Add songs first
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setNewSessionOpen(true)}>
                    + Start a draft
                  </Button>
                )
              }
            >
              {availableSongs.length === 0 ? 'No draft sessions yet — add songs to the pool, then start one.' : 'No draft sessions yet.'}
            </EmptyState>
          ) : (
            <div className="space-y-2">
              {[...board.sessions].reverse().map((session) => (
                <Panel
                  key={session.id}
                  padding="sm"
                  highlight={session.phase !== 'complete'}
                  className="group flex items-center gap-2 hover:border-hardwood-500"
                >
                  <Link to={`/drafts/${board.id}/sessions/${session.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-100">{session.name}</div>
                      <div className="text-xs text-slate-500">
                        {session.drafters.length} drafters · {session.picksPerDrafter} picks each
                      </div>
                    </div>
                    <span className="shrink-0 text-sm text-slate-400">{PHASE_LABEL[session.phase]}</span>
                  </Link>
                  <button
                    onClick={() => deleteSession(session)}
                    aria-label={`Delete ${session.name}`}
                    className="shrink-0 rounded-full p-1.5 text-slate-500 opacity-0 hover:text-scoreboard-500 focus:opacity-100 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </Panel>
              ))}
            </div>
          )}
        </section>

        <Panel padding="lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={togglePool}
              aria-expanded={poolOpen}
              className="flex items-center gap-2 text-left font-display text-xl tracking-wide text-hardwood-400 hover:text-hardwood-300"
            >
              <span aria-hidden>{poolOpen ? '▾' : '▸'}</span>
              SONG POOL
              <span className="text-sm font-normal tracking-normal text-slate-500">
                {availableSongs.length} available{takenSongs.length > 0 ? `, ${takenSongs.length} taken` : ''}
              </span>
            </button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                + From SoundCloud
              </Button>
              {spotifyImportEnabled && (
                <button
                  onClick={() => setSpotifyImportOpen(true)}
                  className="rounded-full border border-[#1DB954]/50 px-4 py-1.5 text-sm text-[#1ed760] hover:border-[#1DB954]"
                >
                  + From Spotify
                </button>
              )}
            </div>
          </div>

          {poolOpen &&
            (board.songPool.length === 0 ? (
              <div className="mt-3">
                <EmptyState icon="📂">No songs yet — import some to build the pool before starting a draft.</EmptyState>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[12rem] flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                    <input
                      value={poolQuery}
                      onChange={(e) => setPoolQuery(e.target.value)}
                      placeholder="Search the pool…"
                      aria-label="Search the song pool"
                      className="w-full rounded-full border border-arena-600 bg-arena-800 py-1.5 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-hardwood-500"
                    />
                  </div>
                  {(['all', 'available', 'taken'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setPoolFilter(f)}
                      aria-pressed={poolFilter === f}
                      className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                        poolFilter === f ? 'bg-hardwood-500 text-arena-950' : 'border border-arena-600 text-slate-300 hover:border-hardwood-500'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                {visiblePool.length === 0 ? (
                  <EmptyState icon="🔎">No songs match.</EmptyState>
                ) : (
                  <ul className="max-h-96 divide-y divide-arena-700 overflow-y-auto rounded-xl border border-arena-700">
                    {visiblePool.map((song) => {
                      const takenSession = song.takenBySessionId ? board.sessions.find((s) => s.id === song.takenBySessionId) : undefined
                      const takenDrafter = takenSession?.drafters.find((d) => d.id === song.takenByDrafterId)
                      return (
                        <li key={song.id} className={`group flex items-center gap-3 px-3 py-2 ${song.takenBySessionId ? 'opacity-50' : ''}`}>
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-arena-700">
                            {song.artworkUrl ? (
                              <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-lg text-arena-500">♪</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-100" title={song.title}>
                              {song.title}
                            </div>
                            <div className="truncate text-xs text-slate-400" title={song.artist}>
                              {song.artist}
                            </div>
                          </div>
                          {takenSession && (
                            <div className="hidden max-w-[40%] shrink-0 truncate text-[11px] sm:block" style={{ color: takenDrafter?.color }}>
                              {takenDrafter?.avatar ? `${takenDrafter.avatar} ` : ''}
                              {takenDrafter?.name ?? 'Taken'} · {takenSession.name}
                            </div>
                          )}
                          {!song.takenBySessionId && (
                            <button
                              onClick={() => removeSong(song)}
                              aria-label={`Remove ${song.title}`}
                              className="shrink-0 rounded-full p-1.5 text-xs text-slate-500 opacity-0 hover:text-scoreboard-500 focus:opacity-100 group-hover:opacity-100"
                            >
                              ✕
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
                <div className="text-xs text-slate-500">
                  Showing {visiblePool.length} of {board.songPool.length}
                </div>
              </div>
            ))}
        </Panel>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Tags</div>
          <TagInput tags={board.tags ?? []} onChange={updateTags} suggestions={[]} listId="draft-tag-suggestions" />
        </div>
      </div>

      {importOpen && <ImportSoundCloudModal onClose={() => setImportOpen(false)} onImport={handleImport} />}
      {spotifyImportOpen && <ImportSpotifyModal onClose={() => setSpotifyImportOpen(false)} onImport={handleSpotifyImport} />}
      {newSessionOpen && (
        <NewDraftSessionModal
          defaultName={`Draft Night ${board.sessions.length + 1}`}
          availableSongCount={availableSongs.length}
          onClose={() => setNewSessionOpen(false)}
          onCreate={handleCreateSession}
        />
      )}
    </div>
  )
}
