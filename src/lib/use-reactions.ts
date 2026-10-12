import { useCallback, useRef, useState } from 'react'

export interface FloatingReaction {
  id: number
  emoji: string
  name: string
  /** Horizontal position, as a percentage of the screen width. */
  x: number
  /** How far it sways sideways while rising, in px. */
  sway: number
}

const LIFETIME_MS = 3400
const MAX_ON_SCREEN = 40

// The reactions currently drifting up a screen. `push` adds one at a random spot and removes it
// when its animation is over; the cap keeps a flood from piling up.
export function useReactions(): { reactions: FloatingReaction[]; push: (emoji: string, name?: string) => void } {
  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const nextId = useRef(0)
  const push = useCallback((emoji: string, name = '') => {
    const id = nextId.current++
    const item: FloatingReaction = { id, emoji, name, x: 6 + Math.random() * 88, sway: (Math.random() - 0.5) * 120 }
    setReactions((prev) => [...prev.slice(-(MAX_ON_SCREEN - 1)), item])
    setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), LIFETIME_MS)
  }, [])
  return { reactions, push }
}
