interface Props {
  steps: string[]
  /** Index of the step in progress. */
  current: number
  className?: string
}

// Tier Guess / Year Guess run as a staged reveal (tier → position, year → month) where only the
// main button's label changes — this shows the whole path and where the room is on it.
export default function StageStepper({ steps, current, className = '' }: Props) {
  return (
    <ol className={`relative z-10 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-[11px] uppercase tracking-widest ${className}`} aria-label="Stages">
      {steps.map((label, i) => (
        <li key={label} className="flex items-center gap-1" aria-current={i === current ? 'step' : undefined}>
          <span
            className={`rounded-full px-2.5 py-1 ${
              i === current ? 'bg-hardwood-500 font-semibold text-arena-950' : i < current ? 'bg-arena-700 text-slate-300' : 'border border-arena-700 text-slate-500'
            }`}
          >
            {i < current ? '✓ ' : ''}
            {label}
          </span>
          {i < steps.length - 1 && <span className="text-slate-600">›</span>}
        </li>
      ))}
    </ol>
  )
}
