import { useCallback, useEffect, useRef, useState } from 'react'
import { playTick } from './sound-effects'

const TICK_FROM_SECONDS = 5

/**
 * Per-turn countdown shared by Guess the Popularity and Guess the Timeline. Restarts
 * whenever `turnKey` changes (a new turn, or a new item within one) and stops while
 * `active` is false or `seconds` is unset/0. Ticks audibly through the last few seconds,
 * then calls `onExpire` once — the caller decides what "out of time" means for its game.
 */
export function useTurnTimer(seconds: number | undefined, turnKey: string, active: boolean, onExpire: () => void) {
  const enabled = active && !!seconds && seconds > 0
  const timerKey = `${turnKey}|${seconds ?? 0}`
  // The last tick's reading, tagged with the turn it belongs to — so a new turn reads as
  // "full time" straight away during render instead of via a reset-in-effect that would
  // show the previous turn's last count for a frame.
  const [tick, setTick] = useState<{ key: string; left: number } | null>(null)
  const startedAtRef = useRef(0)
  // Read at fire time, not captured at effect setup — the caller's onExpire closes over the
  // game state as of the render it was created in, and the interval outlives that render.
  const onExpireRef = useRef(onExpire)
  useEffect(() => {
    onExpireRef.current = onExpire
  })

  useEffect(() => {
    if (!enabled || !seconds) return
    startedAtRef.current = Date.now()
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(seconds - (Date.now() - startedAtRef.current) / 1000))
      setTick({ key: timerKey, left: remaining })
      if (remaining === 0) {
        clearInterval(interval)
        onExpireRef.current()
      } else if (remaining <= TICK_FROM_SECONDS) {
        playTick()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [enabled, seconds, timerKey])

  const secondsLeft = enabled && seconds ? (tick?.key === timerKey ? tick.left : seconds) : null

  /** Whole seconds left right now (not as of the last tick) — for handing a phone an
   *  accurate figure at the moment of a sync, whenever that happens to land mid-second. */
  const remainingNow = useCallback(
    () => (enabled && seconds ? Math.max(0, Math.ceil(seconds - (Date.now() - startedAtRef.current) / 1000)) : null),
    [enabled, seconds],
  )

  return { secondsLeft, remainingNow }
}
