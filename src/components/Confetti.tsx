import { useState } from 'react'

const COLORS = ['#e8871e', '#f4a13f', '#17b8a6', '#3fd4c2', '#ffb703', '#2bd47d', '#ff3b3b']
const PIECE_COUNT = 60

interface Piece {
  left: number
  color: string
  size: number
  delayMs: number
  durationMs: number
}

// Hand-rolled rather than a library — same reasoning as the synthesized sound effects
// (no asset/dependency to manage for a one-time celebration moment). Pieces don't need to
// be removed after falling: they're position:fixed/pointer-events-none and this whole
// component only mounts for the final-score screen in the first place.
export default function Confetti() {
  // useState's lazy initializer, not useMemo — useMemo's factory is meant to be pure and
  // React reserves the right to call it more than once, which would make the confetti
  // visibly re-shuffle; useState only ever runs its initializer once per mount.
  const [pieces] = useState<Piece[]>(() =>
    Array.from({ length: PIECE_COUNT }, () => ({
      left: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 6,
      delayMs: Math.random() * 500,
      durationMs: 2600 + Math.random() * 1800,
    })),
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((piece, i) => (
        <div
          key={i}
          className="animate-confetti-fall absolute top-0 rounded-sm"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size * 0.4,
            background: piece.color,
            animationDelay: `${piece.delayMs}ms`,
            animationDuration: `${piece.durationMs}ms`,
          }}
        />
      ))}
    </div>
  )
}
