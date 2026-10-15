import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

/** A hardwood-orange stripe that sweeps across the screen when you change page — skipped on first load. */
export default function RouteWipe() {
  const { pathname } = useLocation()
  const first = useRef(pathname)
  const [wipeKey, setWipeKey] = useState<string | null>(null)

  useEffect(() => {
    if (pathname === first.current) return
    first.current = pathname
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
