import type { ImportableTrack } from '../lib/soundcloud/soundcloud-tracks'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const ACCESS_BADGE: Record<ImportableTrack['access'], { label: string; className: string }> = {
  playable: { label: 'Playable', className: 'bg-teal-500/15 text-teal-400' },
  preview: { label: 'Preview only', className: 'bg-scoreboard-amber/15 text-scoreboard-amber' },
  blocked: { label: 'Not playable', className: 'bg-scoreboard-500/15 text-scoreboard-500' },
}

interface TrackCardProps {
  track: ImportableTrack
  selected?: boolean
  onToggleSelect?: () => void
  onPreview?: () => void
  isPreviewing?: boolean
  onAdd?: () => void
}

export default function TrackCard({ track, selected, onToggleSelect, onPreview, isPreviewing, onAdd }: TrackCardProps) {
  const badge = ACCESS_BADGE[track.access]
  const canPlay = track.access !== 'blocked'

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-arena-800 transition-colors ${
        selected ? 'border-hardwood-500 ring-1 ring-hardwood-500' : 'border-arena-600 hover:border-arena-500'
      }`}
    >
      {onToggleSelect && (
        <button
          onClick={onToggleSelect}
          aria-label={selected ? 'Deselect track' : 'Select track'}
          className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border text-sm ${
            selected ? 'border-hardwood-500 bg-hardwood-500 text-arena-950' : 'border-white/40 bg-black/40 text-transparent'
          }`}
        >
          ✓
        </button>
      )}

      <div className="relative aspect-square w-full bg-arena-700">
        {track.artworkUrl ? (
          <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-arena-500">♪</div>
        )}
        {canPlay && onPreview && (
          <button
            onClick={onPreview}
            className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-hardwood-500 hover:text-arena-950"
            aria-label="Preview track"
          >
            {isPreviewing ? '■' : '▶'}
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="truncate font-semibold text-slate-100" title={track.title}>
          {track.title}
        </div>
        <div className="truncate text-sm text-slate-400" title={track.artist}>
          {track.artist}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">{formatDuration(track.duration)}</span>
          {track.isPrivate && <span className="rounded bg-arena-600 px-1.5 py-0.5 text-slate-300">🔒 Private</span>}
          <span className={`rounded px-1.5 py-0.5 font-medium ${badge.className}`}>{badge.label}</span>
        </div>

        {onAdd && (
          <button
            onClick={onAdd}
            className="mt-2 rounded-lg bg-arena-600 py-1.5 text-sm font-medium text-slate-100 hover:bg-hardwood-500 hover:text-arena-950"
          >
            + Add to game
          </button>
        )}
      </div>
    </div>
  )
}
