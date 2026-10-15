import type { CSSProperties } from 'react'
import type { StickerId } from '../lib/buzzer/protocol'
import { STICKER_ICON, stickerLabel } from '../lib/sticker-icons'
import type { FloatingSticker } from '../lib/use-stickers'
import { Icon } from './Icon'

/** One sticker slab: heavy caps on the sending team's colour, a hard shadow, a dashed die-cut edge. */
export function StickerSlab({ sticker, color, className = '' }: { sticker: StickerId; color: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 border-2 border-dashed border-[#050a1c]/55 px-4 py-1.5 font-display text-4xl leading-none tracking-wider text-[#050a1c] shadow-[5px_5px_0_0_rgb(0_0_0/0.5)] ${className}`}
      style={{ background: color }}
    >
      <Icon name={STICKER_ICON[sticker]} />
      {stickerLabel(sticker)}
    </span>
  )
}

// Trash-talk stickers stuck over whatever's on screen: purely decorative, never intercepts clicks.
export default function StickerLayer({ stickers }: { stickers: FloatingSticker[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {stickers.map((s) => (
        <div key={s.id} className="animate-sticker-slam absolute" style={{ left: `${s.x}%`, top: `${s.y}%`, '--tilt': `${s.rotate}deg` } as CSSProperties}>
          <StickerSlab sticker={s.sticker} color={s.color} className="sm:text-6xl" />
          <div className="mt-2 flex justify-center">
            <span className="rounded-full bg-black/70 px-3 py-1 text-sm font-semibold text-slate-100">
              {s.name}
              <span className="text-slate-400"> · {s.teamName}</span>
              {s.targetName && <span className="text-hardwood-400"> ▸ {s.targetName}</span>}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
