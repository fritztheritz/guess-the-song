import { useCallback, useRef, useState } from 'react'
import type { StickerId } from './buzzer/protocol'

export interface FloatingSticker {
  id: number
  sticker: StickerId
  /** Who slapped it on, and for which team. */
  name: string
  teamName: string
  color: string
  /** The rival it's aimed at, if any. */
  targetName?: string
  /** Position as a percentage of the screen, and a tilt in degrees. */
  x: number
  y: number
  rotate: number
}

const LIFETIME_MS = 4200
const MAX_ON_SCREEN = 5

export type StickerInput = Pick<FloatingSticker, 'sticker' | 'name' | 'teamName' | 'color' | 'targetName'>

// The stickers currently stuck on a screen. Each lands at a random spot with a random tilt and peels off
// after a few seconds; the cap keeps a busy room from burying the clue.
export function useStickers(): { stickers: FloatingSticker[]; push: (s: StickerInput) => void } {
  const [stickers, setStickers] = useState<FloatingSticker[]>([])
  const nextId = useRef(0)
  const push = useCallback((s: StickerInput) => {
    const id = nextId.current++
    const item: FloatingSticker = { ...s, id, x: 8 + Math.random() * 58, y: 14 + Math.random() * 52, rotate: (Math.random() - 0.5) * 22 }
    setStickers((prev) => [...prev.slice(-(MAX_ON_SCREEN - 1)), item])
    setTimeout(() => setStickers((prev) => prev.filter((x) => x.id !== id)), LIFETIME_MS)
  }, [])
  return { stickers, push }
}
