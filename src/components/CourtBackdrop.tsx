import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// The page background is a half-court floor plan, drawn once and fixed behind every screen. Each route
// "pans the camera" to a different part of the court (the key, the arc, the tip-off circle…), so moving
// around the app reads as moving around the floor. Court units are feet × 20 (a 50 × 47 ft half court).

interface Crop {
  /** Court point to centre on, and zoom. */
  x: number
  y: number
  zoom: number
}

const CROPS: Record<string, Crop> = {
  home: { x: 500, y: 470, zoom: 1 },
  key: { x: 500, y: 300, zoom: 1.5 },
  arc: { x: 500, y: 520, zoom: 1.3 },
  center: { x: 500, y: 800, zoom: 1.6 },
  corner: { x: 220, y: 240, zoom: 1.6 },
  rim: { x: 500, y: 330, zoom: 1.2 },
}

function cropFor(pathname: string): Crop {
  const seg = pathname.split('/')[1] ?? ''
  if (seg === '') return CROPS.home
  if (seg === 'tierlists' || seg === 'drafts') return CROPS.key
  if (seg === 'stats' || seg === 'players' || seg === 'seasons' || seg === 'tournaments') return CROPS.center
  if (seg === 'settings' || seg === 'admin' || seg === 'import' || seg === 'callback') return CROPS.corner
  if (seg === 'buzz') return CROPS.rim
  return CROPS.arc
}

import { isStageRoute } from '../lib/stage-route'

export default function CourtBackdrop() {
  const { pathname } = useLocation()
  const { x, y, zoom } = cropFor(pathname)
  const loud = isStageRoute(pathname) || pathname === '/'
  // The player's phone page gets a ball for a mouse pointer (only visible with a mouse — touch has no cursor).
  useEffect(() => {
    const on = pathname.split('/')[1] === 'buzz'
    document.documentElement.classList.toggle('cursor-ball', on)
    return () => document.documentElement.classList.remove('cursor-ball')
  }, [pathname])
  // viewBox is 1000 × 940; the group is scaled about the origin so (x, y) lands on the centre.
  const transform = `translate(${500 - zoom * x}px, ${470 - zoom * y}px) scale(${zoom})`
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, #ff6a13 0 2px, transparent 2px 46px), linear-gradient(180deg, transparent, #050a1c 85%)',
        }}
      />
      <svg className={`absolute inset-0 h-full w-full transition-colors duration-700 ${loud ? 'text-white/[0.075]' : 'text-white/[0.03]'}`} viewBox="0 0 1000 940" preserveAspectRatio="xMidYMid slice">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth={loud ? 5 : 3.5}
          strokeLinecap="round"
          style={{ transform, transition: 'transform 900ms cubic-bezier(0.5, 0, 0.2, 1)' }}
          className="motion-reduce:!transition-none"
        >
          {/* sidelines + half-court line */}
          <path d="M0 0H1000V940H0Z" />
          {/* the key, free-throw circle (dashed lower half) */}
          <path d="M340 0V380H660V0" />
          <path d="M380 380A120 120 0 0 1 620 380" />
          <path d="M380 380A120 120 0 0 0 620 380" strokeDasharray="16 14" />
          {/* backboard, rim, restricted-area arc */}
          <path d="M440 80H560" strokeWidth="9" />
          <circle cx="500" cy="105" r="18" />
          <path d="M420 105A80 80 0 0 0 580 105" />
          {/* three-point line */}
          <path d="M60 0V284A475 475 0 0 0 940 284V0" />
          {/* tip-off circles */}
          <path d="M380 940A120 120 0 0 1 620 940" />
          <path d="M460 940A40 40 0 0 1 540 940" />
          {/* lane hash marks */}
          <path d="M320 120h-24M320 200h-24M320 280h-24M680 120h24M680 200h24M680 280h24" />
        </g>
      </svg>
    </div>
  )
}
