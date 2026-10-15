import { withIcons } from '../lib/with-icons'

// Progress through a multi-step form: numbered dots joined by a line. Steps already reached can be clicked to
// go back; the current one is marked for screen readers.
export default function Stepper({ steps, current, onGo }: { steps: string[]; current: number; onGo?: (step: number) => void }) {
  return (
    <ol className="flex items-center justify-center gap-2 text-xs" aria-label="Progress">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        const dot = (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
              active ? 'bg-hardwood-500 text-arena-950' : done ? 'bg-hardwood-500/25 text-hardwood-300' : 'border border-arena-600 text-slate-500'
            }`}
            aria-hidden
          >
            {done ? withIcons('✓') : i + 1}
          </span>
        )
        return (
          <li key={label} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
            {done && onGo ? (
              <button type="button" onClick={() => onGo(i)} className="flex items-center gap-1.5 text-slate-300 hover:text-white">
                {dot}
                <span className="hidden sm:inline">{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </button>
            ) : (
              <span className={`flex items-center gap-1.5 ${active ? 'text-white' : 'text-slate-500'}`}>
                {dot}
                <span className={active ? '' : 'hidden sm:inline'}>{label}</span>
              </span>
            )}
            {i < steps.length - 1 && <span className="h-px w-6 bg-arena-600 sm:w-10" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}
