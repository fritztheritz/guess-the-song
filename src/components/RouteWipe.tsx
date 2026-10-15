import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isStageRoute } from '../lib/stage-route'
import { getCalm } from '../lib/settings'

/** A hardwood-orange stripe that sweeps across the screen — only when going into or out of a game screen, so
 *  everyday navigation (forms, lists, settings) stays quiet. Skipped on first load and with Reduce effects on. */
export default function RouteWipe() {
  const { pathname } = useLocation()
  const prev = useRef(pathname)
  const [wipeKey, setWipeKey] = useState<string | null>(null)

  useEffect(() => {
    const from = prev.current
    if (pathname === from) return
    prev.current = pathname
    if (getCalm() || !(isStageRoute(from) || isStageRoute(pathname))) return
    setWipeKey(pathname)
    const t = setTimeout(() => setWipeKey(null), 560)
    return () => clearTimeout(t)
  }, [pathname])

  if (!wipeKey) return null
  return (
    <div key={wipeKey} className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      <div className="animate-route-wipe absolute inset-y-0 left-0 w-[45%] bg-hardwood-500">
        <div className="absolute inset-y-0 right-0 w-3 bg-pop-400" />
      </div>
    </div>
  )
}
