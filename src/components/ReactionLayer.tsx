import type { FloatingReaction } from '../lib/use-reactions'

// Crowd reactions floating up over whatever's on screen. Purely decorative (aria-hidden) and never
// intercepts clicks, so it can sit on top of the host controls.
export default function ReactionLayer({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="animate-reaction-float absolute bottom-6 flex flex-col items-center"
          style={{ left: `${r.x}%`, '--sway': `${r.sway}px` } as React.CSSProperties}
        >
          <span className="text-5xl drop-shadow-lg">{r.emoji}</span>
          {r.name && <span className="mt-0.5 max-w-24 truncate rounded-full bg-black/60 px-2 py-0.5 text-xs text-slate-200">{r.name}</span>}
        </div>
      ))}
    </div>
  )
}
