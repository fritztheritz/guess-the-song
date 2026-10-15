/** An on/off switch built like the arena's shot-clock panel: a dark bezel, a lit ON / dim OFF readout and a
 *  slab that slides across. Same a11y as any switch (role + aria-checked). */
export default function Switch({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative h-8 w-[4.5rem] shrink-0 overflow-hidden rounded-sm border-2 border-arena-600 bg-black/60 shadow-[inset_0_2px_6px_rgb(0_0_0/0.7)] transition-colors hover:border-arena-500"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 flex w-1/2 items-center justify-center font-display text-sm tracking-wider transition-all duration-200 ${
          on ? 'left-0 text-scoreboard-amber [text-shadow:0_0_8px_currentColor]' : 'right-0 text-slate-600'
        }`}
      >
        {on ? 'ON' : 'OFF'}
      </span>
      <span
        aria-hidden
        className={`absolute inset-y-[3px] w-[calc(50%-3px)] rounded-[2px] shadow-[2px_2px_0_0_rgb(0_0_0/0.5)] transition-all duration-200 ${
          on ? 'left-[calc(50%)] bg-hardwood-500' : 'left-[3px] bg-arena-500'
        }`}
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgb(0 0 0 / 0.18) 0 2px, transparent 2px 6px)' }}
      />
    </button>
  )
}
