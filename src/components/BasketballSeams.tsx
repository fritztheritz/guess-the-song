/** Pebble-leather seam lines for a ball-shaped button. Sits behind the label; colour via text-*. */
export default function BasketballSeams({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M50 0V100M0 50H100" />
      <path d="M17 12C36 32 36 68 17 88" />
      <path d="M83 12C64 32 64 68 83 88" />
    </svg>
  )
}
