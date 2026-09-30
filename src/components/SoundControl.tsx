import { useEffect, useRef, useState } from 'react'
import { getSoundVolume, isSoundMuted, setSoundMuted, setSoundVolume } from '../lib/sound-effects'

// Replaces the mute-only icon button every presentation-style page (Host Controller, Draft
// Presentation, Tier List / Popularity / Timeline present) used to hand-roll identically —
// click to reveal a volume slider alongside the mute toggle, one shared control instead of
// five copy-pasted all-or-nothing buttons.
export default function SoundControl() {
  const [open, setOpen] = useState(false)
  const [muted, setMutedState] = useState(() => isSoundMuted())
  const [volume, setVolumeState] = useState(() => getSoundVolume())
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

  function toggleMute() {
    const next = !muted
    setSoundMuted(next)
    setMutedState(next)
  }

  function changeVolume(next: number) {
    setSoundVolume(next)
    setVolumeState(next)
    // Dragging the slider up while muted should be audible right away, like a real volume
    // knob — otherwise it'd look like the slider did nothing until a separate unmute.
    if (muted && next > 0) {
      setSoundMuted(false)
      setMutedState(false)
    }
  }

  const icon = muted || volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-sm text-slate-300 hover:bg-black/60"
        aria-label="Sound settings"
        aria-expanded={open}
      >
        {icon}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-44 space-y-2 rounded-xl border border-arena-600 bg-arena-900 p-3 shadow-2xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Volume</span>
            <button onClick={toggleMute} className="font-medium text-slate-400 hover:text-slate-200">
              {muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="w-full accent-hardwood-500"
            aria-label="Sound volume"
          />
        </div>
      )}
    </div>
  )
}
