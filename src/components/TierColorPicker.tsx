import { useEffect, useRef, useState } from 'react'
import { TIER_SWATCHES } from '../types/tierlist'

// A swatch button that opens a small palette of good defaults, with the native colour input as the
// "Custom" escape hatch — the bare native picker is a tiny box that's easy to miss.
export default function TierColorPicker({ color, label, onChange }: { color: string; label: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-arena-500 hover:border-hardwood-500"
      >
        <span className="h-6 w-6 rounded-md" style={{ background: color }} />
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-30 w-52 rounded-xl border border-arena-600 bg-arena-900 p-3 shadow-2xl">
          <div className="grid grid-cols-4 gap-2">
            {TIER_SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onChange(c)
                  setOpen(false)
                }}
                aria-label={`Use ${c}`}
                aria-pressed={c.toLowerCase() === color.toLowerCase()}
                className={`h-9 rounded-lg border-2 ${c.toLowerCase() === color.toLowerCase() ? 'border-white' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <label className="mt-3 flex items-center justify-between text-xs text-slate-400">
            Custom
            <input type="color" value={color} onChange={(e) => onChange(e.target.value)} className="h-8 w-14 cursor-pointer rounded border border-arena-600 bg-transparent p-0.5" />
          </label>
        </div>
      )}
    </div>
  )
}
