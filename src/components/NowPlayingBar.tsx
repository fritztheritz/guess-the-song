import type { DraftPoolSong, Drafter } from '../types/draft'

interface Props {
  /** The track currently playing, if any. */
  song?: DraftPoolSong
  /** Whose pick it was. */
  drafter?: Drafter
  /** Position in the listening order (1-based) and its length. */
  index: number
  total: number
  onPrev: () => void
  onNext: () => void
  onStop: () => void
}

// Pinned to the bottom of the Listening screen while something is playing: what it is, whose pick
// it was, and previous / next / stop through the whole draft in pick order.
export default function NowPlayingBar({ song, drafter, index, total, onPrev, onNext, onStop }: Props) {
  if (!song) return null
  return (
    <div role="region" aria-label="Now playing" className="sticky bottom-3 z-20 flex items-center gap-3 rounded-xl border border-hardwood-500 bg-arena-900/95 px-4 py-3 shadow-2xl shadow-black/60 backdrop-blur">
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-arena-700">
        {song.artworkUrl ? <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-arena-500">♪</div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.3em] text-hardwood-400">
          Now playing · {index} of {total}
        </div>
        <div className="truncate text-sm font-semibold text-slate-100">{song.title}</div>
        <div className="truncate text-xs text-slate-400">
          {song.artist}
          {drafter && (
            <span style={{ color: drafter.color }}>
              {' · '}
              {drafter.avatar ? `${drafter.avatar} ` : ''}
              {drafter.name}'s pick
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button onClick={onPrev} disabled={index <= 1} aria-label="Previous track" className="rounded-full px-3 py-2 text-lg text-slate-300 hover:bg-arena-700 disabled:opacity-30">
          ⏮
        </button>
        <button onClick={onStop} aria-label="Stop" className="rounded-full bg-hardwood-500 px-3 py-2 text-lg text-arena-950 hover:bg-hardwood-400">
          ■
        </button>
        <button onClick={onNext} disabled={index >= total} aria-label="Next track" className="rounded-full px-3 py-2 text-lg text-slate-300 hover:bg-arena-700 disabled:opacity-30">
          ⏭
        </button>
      </div>
    </div>
  )
}
