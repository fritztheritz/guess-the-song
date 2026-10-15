import { useState } from 'react'
import { STICKERS, type BuzzerTeam, type StickerId } from '../lib/buzzer/protocol'
import { STICKER_ICON } from '../lib/sticker-icons'
import { Icon } from './Icon'

const COOLDOWN_MS = 2600

// A teamed phone's trash-talk drawer: pick who it's aimed at (anyone, or one rival team), then tap a sticker.
// The cooldown matches the room's own, so a mashed button doesn't look like it worked when the room dropped it.
export default function StickerBar({ teams, myTeamId, onSend }: { teams: BuzzerTeam[]; myTeamId: string; onSend: (sticker: StickerId, targetTeamId?: string) => void }) {
  const [open, setOpen] = useState(true)
  const [target, setTarget] = useState<string | null>(null)
  const [cooling, setCooling] = useState(false)
  const [sent, setSent] = useState<StickerId | null>(null)
  const rivals = teams.filter((t) => t.id !== myTeamId)

  return (
    <div className="w-full max-w-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="sticker mx-auto text-lg"
      >
        <Icon name="megaphone" /> Trash talk {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl border-2 border-arena-600 bg-arena-800/80 p-3 text-left shadow-lg">
          <div>
            <div className="mb-1.5 text-xs uppercase tracking-widest text-slate-500">Aim at</div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Aim at">
              <button
                type="button"
                aria-pressed={target === null}
                onClick={() => setTarget(null)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${target === null ? 'border-hardwood-500 bg-hardwood-500 text-arena-950' : 'border-arena-500 text-slate-300'}`}
              >
                Anyone
              </button>
              {rivals.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={target === t.id}
                  onClick={() => setTarget(t.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${target === t.id ? 'text-arena-950' : 'text-slate-300'}`}
                  style={target === t.id ? { background: t.color, borderColor: t.color } : { borderColor: t.color }}
                >
                  {t.avatar ? `${t.avatar} ` : ''}
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {STICKERS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                disabled={cooling}
                onClick={() => {
                  onSend(s.id, target ?? undefined)
                  navigator.vibrate?.(20)
                  setSent(s.id)
                  setCooling(true)
                  setTimeout(() => setCooling(false), COOLDOWN_MS)
                }}
                className={`flex items-center justify-center gap-1.5 rounded-sm border-2 border-dashed border-arena-500 bg-arena-700 px-2 py-2.5 font-display text-lg tracking-wider text-slate-100 shadow-[3px_3px_0_0_rgb(0_0_0/0.45)] transition active:scale-95 disabled:opacity-50 ${i % 2 ? 'rotate-1' : '-rotate-1'} ${
                  sent === s.id && cooling ? 'border-hardwood-500 text-hardwood-400' : ''
                }`}
              >
                <Icon name={STICKER_ICON[s.id]} /> {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
