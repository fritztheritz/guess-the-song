import type { ReactNode } from 'react'

// Shared building blocks for the pickers on a player's phone (Higher or Lower, Blind Ranking, …), so
// the song card, the "you're locked in" banner and the numbered-tile grid look and feel the same in each.

export function PhoneSongCard({ title, artist, artworkUrl }: { title: string; artist: string; artworkUrl?: string }) {
  return (
    <div className="ticket flex items-center gap-3 rounded-2xl border-2 border-arena-600 bg-arena-800 px-5 py-3 text-left">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-arena-700">
        {artworkUrl ? <img src={artworkUrl} alt="" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="min-w-0">
        <div className="truncate font-display text-xl text-white">{title}</div>
        <div className="truncate text-sm text-slate-400">{artist}</div>
      </div>
    </div>
  )
}

const TONES = {
  good: 'border-scoreboard-green bg-scoreboard-green/15 text-scoreboard-green',
  neutral: 'border-arena-600 bg-arena-800 text-slate-300',
  accent: 'border-hardwood-500/40 bg-hardwood-500/10 text-hardwood-400',
} as const

/** The status box a picker shows once the phone has done its bit (locked in, result, all done). */
export function PhoneBanner({ tone = 'good', title, children }: { tone?: keyof typeof TONES; title: ReactNode; children?: ReactNode }) {
  return (
    <div role="status" className={`rounded-xl border-2 px-4 py-3 text-center ${TONES[tone]}`}>
      <div className="font-display text-xl tracking-wide">{title}</div>
      {children && <div className="mt-0.5 text-xs text-slate-300">{children}</div>}
    </div>
  )
}
