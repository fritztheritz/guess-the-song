import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { DraftBoard, DraftPoolSong, DraftSession } from '../types/draft'
import { createDraftSession } from '../types/draft'
import { getDraftBoard, saveDraftBoard } from '../lib/storage/draft-repository'
import { useFeatureFlag } from '../state/FeatureFlagsContext'
import { isSpotifyConfigured } from '../lib/spotify/config'
import { useToast } from '../state/ToastContext'
import { useConfirm } from '../state/ConfirmContext'
import ImportSoundCloudModal from '../components/ImportSoundCloudModal'
import ImportSpotifyModal from '../components/ImportSpotifyModal'
import NewDraftSessionModal from '../components/NewDraftSessionModal'
import TagInput from '../components/TagInput'
import Spinner from '../components/Spinner'
import type { ImportableTrack } from '../lib/soundcloud/soundcloud-tracks'
import type { ImportableSpotifyTrack } from '../lib/spotify/spotify-tracks'

const PHASE_LABEL: Record<DraftSession['phase'], string> = {
  drafting: '🎧 Drafting',
  ranking: '📊 Ranking',
  complete: '✅ Complete',
}

export default function DraftBoardHome() {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const showToast = useToast()
  const confirm = useConfirm()
  const spotifyImportEnabled = useFeatureFlag('spotify-import') && isSpotifyConfigured()
  const [board, setBoard] = useState<DraftBoard | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [spotifyImportOpen, setSpotifyImportOpen] = useState(false)
  const [newSessionOpen, setNewSessionOpen] = useState(false)

  useEffect(() => {
    if (!boardId) return
    setBoard(getDraftBoard(boardId))
  }, [boardId])

  const availableSongs = useMemo(() => board?.songPool.filter((s) => !s.takenBySessionId) ?? [], [board])
  const takenSongs = useMemo(() => board?.songPool.filter((s) => s.takenBySessionId) ?? [], [board])

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

  async function removeSong(song: DraftPoolSong) {
    if (!board) return
    const ok = await confirm(`Remove "${song.title}" from the pool?`, { danger: true, confirmLabel: 'Remove' })
    if (!ok) return
    persist({ ...board, songPool: board.songPool.filter((s) => s.id !== song.id) })
  }

  function handleCreateSession({ name, drafters, picksPerDrafter }: { name: string; drafters: DraftSession['drafters']; picksPerDrafter: number }) {
    if (!board) return
    const session = createDraftSession(name, drafters, picksPerDrafter)
    persist({ ...board, sessions: [...board.sessions, session] })
    setNewSessionOpen(false)
    navigate(`/drafts/${board.id}/sessions/${session.id}`)
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

        <div className="rounded-xl border border-arena-600 bg-arena-800/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-xl tracking-wide text-hardwood-400">
              SONG POOL <span className="text-sm text-slate-500">({availableSongs.length} available{takenSongs.length > 0 ? `, ${takenSongs.length} taken` : ''})</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setImportOpen(true)}
                className="rounded-full border border-arena-500 px-4 py-1.5 text-sm text-slate-200 hover:border-hardwood-500"
              >
                + From SoundCloud
              </button>
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

          {board.songPool.length === 0 ? (
            <p className="text-sm text-slate-500">No songs yet — import some to build the pool before starting a draft.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {board.songPool.map((song) => {
                const takenSession = song.takenBySessionId ? board.sessions.find((s) => s.id === song.takenBySessionId) : undefined
                const takenDrafter = takenSession?.drafters.find((d) => d.id === song.takenByDrafterId)
                return (
                  <div
                    key={song.id}
                    className={`group relative flex flex-col overflow-hidden rounded-xl border bg-arena-800 text-left ${
                      song.takenBySessionId ? 'border-arena-700 opacity-50' : 'border-arena-600'
                    }`}
                  >
                    {!song.takenBySessionId && (
                      <button
                        onClick={() => removeSong(song)}
                        aria-label={`Remove ${song.title}`}
                        className="absolute right-1.5 top-1.5 z-10 hidden h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-slate-300 hover:text-scoreboard-500 group-hover:flex"
                      >
                        ✕
                      </button>
                    )}
                    <div className="aspect-square w-full bg-arena-700">
                      {song.artworkUrl ? <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" /> : (
                        <div className="flex h-full w-full items-center justify-center text-3xl text-arena-500">♪</div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="truncate text-sm font-semibold text-slate-100" title={song.title}>
                        {song.title}
                      </div>
                      <div className="truncate text-xs text-slate-400" title={song.artist}>
                        {song.artist}
                      </div>
                      {takenSession && (
                        <div className="mt-1 truncate text-[11px]" style={{ color: takenDrafter?.color }}>
                          {takenDrafter?.avatar ? `${takenDrafter.avatar} ` : ''}
                          {takenDrafter?.name ?? 'Taken'} · {takenSession.name}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-xl tracking-wide text-hardwood-400">DRAFT SESSIONS</div>
            <button
              onClick={() => setNewSessionOpen(true)}
              disabled={availableSongs.length === 0}
              className="rounded-full border border-arena-500 px-4 py-1.5 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-30 hover:border-hardwood-500"
            >
              + New Session
            </button>
          </div>

          {board.sessions.length === 0 ? (
            <p className="text-sm text-slate-500">No draft sessions yet.</p>
          ) : (
            <div className="space-y-2">
              {[...board.sessions].reverse().map((session) => (
                <Link
                  key={session.id}
                  to={`/drafts/${board.id}/sessions/${session.id}`}
                  className="flex items-center justify-between rounded-xl border border-arena-600 bg-arena-800/60 p-3 hover:border-hardwood-500"
                >
                  <div>
                    <div className="font-semibold text-slate-100">{session.name}</div>
                    <div className="text-xs text-slate-500">
                      {session.drafters.length} drafters · {session.picksPerDrafter} picks each
                    </div>
                  </div>
                  <span className="text-sm text-slate-400">{PHASE_LABEL[session.phase]}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

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
