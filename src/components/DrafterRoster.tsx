import type { DraftPoolSong, Drafter } from '../types/draft'
import Panel from './ui/Panel'

export default function DrafterRoster({
  drafter,
  songs,
  highlight,
  onCreatePlaylist,
  createDisabledReason,
  onResetPlaylist,
  onPreviewSong,
  previewingSongId,
}: {
  drafter: Drafter
  songs: DraftPoolSong[]
  highlight?: boolean
  /** Opens the naming modal. Only passed on the listening screen, and only when the drafter
   *  has an eligible song. */
  onCreatePlaylist?: () => void
  /** When set, the Create button shows but is disabled, with this as the reason (instead of silently vanishing). */
  createDisabledReason?: string
  /** Clears a stale/broken playlist link so "Create" reappears. Only passed on the listening
   *  screen, alongside onCreatePlaylist — covers links made before the secret_token fix, or a
   *  playlist deleted on SoundCloud's side. */
  onResetPlaylist?: () => void
  /** Plays/pauses a song via this app's own authenticated SoundCloud connection — works for
   *  private tracks (unlike embedding SoundCloud's public widget, which cannot play private
   *  content at all, full stop). Only passed on the listening screen. */
  onPreviewSong?: (song: DraftPoolSong) => void
  previewingSongId?: string | null
}) {
  return (
    <Panel padding="sm" highlight={highlight}>
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 truncate text-sm font-semibold" style={{ color: drafter.color }}>
          {drafter.avatar ? `${drafter.avatar} ` : ''}
          {drafter.name}
        </div>
        {drafter.soundcloudPlaylistUrl ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <a href={drafter.soundcloudPlaylistUrl} target="_blank" rel="noreferrer" className="text-xs text-[#ff7733] hover:text-[#ff5500]">
              🎵 Playlist ↗
            </a>
            {onResetPlaylist && (
              <button onClick={onResetPlaylist} aria-label="Reset playlist link" title="Reset playlist link" className="text-xs text-slate-500 hover:text-slate-300">
                ↻
              </button>
            )}
          </div>
        ) : (
          onCreatePlaylist && (
            <button
              onClick={onCreatePlaylist}
              disabled={!!createDisabledReason}
              title={createDisabledReason}
              className="shrink-0 text-xs text-slate-400 enabled:hover:text-[#ff7733] disabled:cursor-not-allowed disabled:opacity-40"
            >
              🎵 Create
            </button>
          )
        )}
      </div>
      {songs.length === 0 ? (
        <p className="text-xs text-slate-500">No picks yet</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-300">
          {songs.map((song) => {
            const canPreview = onPreviewSong && song.source === 'soundcloud' && song.soundcloudTrackId
            const isPreviewing = previewingSongId === song.id
            return (
              <li key={song.id} className="flex items-center gap-1.5 truncate">
                {canPreview && (
                  <button
                    onClick={() => onPreviewSong(song)}
                    aria-label={isPreviewing ? `Stop ${song.title}` : `Play ${song.title}`}
                    className={`shrink-0 ${isPreviewing ? 'text-hardwood-400' : 'text-slate-500 hover:text-hardwood-400'}`}
                  >
                    {isPreviewing ? '■' : '▶'}
                  </button>
                )}
                <span className="truncate">
                  {song.title} <span className="text-slate-500">— {song.artist}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
