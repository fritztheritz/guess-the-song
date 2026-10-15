interface SegDigitsProps {
  value: number | string
  /** Minimum number of lit-or-unlit cells (the dim "8"s behind the number). */
  cells?: number
  className?: string
  label?: string
}

/** A seven-segment LED readout — the live number over a ghost of the unlit segments, the way an arena
 *  scoreboard looks. Colour comes from `text-*` on the element (the glow follows currentColor). */
export default function SegDigits({ value, cells = 2, className = '', label }: SegDigitsProps) {
  const text = String(value)
  const width = Math.max(cells, text.length)
  return (
    <span className={`seg ${className}`} role="img" aria-label={label ?? text}>
      <span className="seg-ghost" aria-hidden>
        {'8'.repeat(width)}
      </span>
      <span className="seg-live" aria-hidden>
        {text}
      </span>
    </span>
  )
}
