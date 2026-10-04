import { useEffect, useState, type ReactNode } from 'react'

function reducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const ROLL_MS = 900
const STAGGER_MS = 160

/** A number that "rolls" like a slot machine — each digit cycles random digits, then locks to the
 *  real one left to right. Non-digits (and users who prefer reduced motion) show as-is. */
export function RollReveal({ value }: { value: string }) {
  const [now, setNow] = useState(() => performance.now())
  const [start] = useState(() => performance.now())
  const animate = !reducedMotion() && /\d/.test(value)
  const total = ROLL_MS + STAGGER_MS * value.length
  useEffect(() => {
    if (!animate) return
    const id = setInterval(() => setNow(performance.now()), 60)
    const stop = setTimeout(() => clearInterval(id), total + 100)
    return () => {
      clearInterval(id)
      clearTimeout(stop)
    }
  }, [animate, total])
  const elapsed = now - start
  return (
    <span aria-label={value}>
      {value.split('').map((ch, i) => {
        const settled = !animate || !/\d/.test(ch) || elapsed >= ROLL_MS + STAGGER_MS * i
        return (
          <span key={i} aria-hidden>
            {settled ? ch : String((Math.floor(now / 60) * 7 + i * 3) % 10)}
          </span>
        )
      })}
    </span>
  )
}

/** Slams its content in — scales up from small with a slight overshoot and a glow. */
export function PopReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`animate-reveal-pop inline-block ${className}`}>{children}</span>
}
