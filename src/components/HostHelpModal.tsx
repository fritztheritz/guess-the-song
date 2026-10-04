import type { Team } from '../types'

interface SoundboardKey {
  key: string
  label: string
}

// The "?" keyboard-controls card. Clip-only keys (Space/R, and buzzing in with a team's number) are
// listed only for modes that have a clip and a buzz race.
export default function HostHelpModal({
  teams,
  clipMode,
  soundboard,
  onClose,
}: {
  teams: Team[]
  /** Song/Lyric: there's a clip to play/restart and teams can buzz in from the keyboard. */
  clipMode: boolean
  soundboard: SoundboardKey[]
  onClose: () => void
}) {
  const rows: Array<readonly [string, string]> = [
    ...(clipMode
      ? ([
          ['Space', 'Play current clue'],
          ['R', 'Restart current clue'],
        ] as const)
      : []),
    ['Enter', 'Reveal answer / next possession'],
    ['→', 'Next possession'],
    ['←', 'Previous possession'],
    ['U', 'Undo the last award'],
    ...(clipMode && teams.length > 0 ? ([[`1–${teams.length}`, 'Buzz in for that team (no phone needed)']] as const) : []),
    ['Esc', 'Exit presentation'],
    ...soundboard.map((b) => [b.key, `Soundboard: ${b.label}`] as const),
    ['?', 'Toggle this help'],
  ]
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 px-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-arena-600 bg-arena-900 p-6 shadow-2xl">
        <div className="mb-4 font-display text-2xl tracking-wide text-hardwood-400">KEYBOARD CONTROLS</div>
        <dl className="space-y-2 text-sm">
          {rows.map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <dt className="rounded bg-arena-700 px-2 py-0.5 font-mono text-xs text-slate-200">{key}</dt>
              <dd className="text-slate-400">{desc}</dd>
            </div>
          ))}
        </dl>
        {clipMode && teams.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-arena-700 pt-3">
            {teams.map((team, i) => (
              <span key={team.id} className="flex items-center gap-1.5 rounded-full bg-arena-800 py-1 pl-1 pr-2.5 text-xs" style={{ color: team.color }}>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-arena-700 font-mono text-[11px] text-slate-200">{i + 1}</span>
                {team.avatar ? `${team.avatar} ` : ''}
                {team.name}
              </span>
            ))}
          </div>
        )}
        <button onClick={onClose} className="mt-5 w-full rounded-full bg-hardwood-500 py-2 text-sm font-semibold text-arena-950 hover:bg-hardwood-400">
          Got it
        </button>
      </div>
    </div>
  )
}
