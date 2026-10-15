import { useState } from 'react'

/** The big leather ball in the Home hero: pebbled, seamed, half off the edge of the screen. Hover or
 *  click and it rolls a quarter turn (a click spins it all the way round). */
export default function HeroBall({ className = '' }: { className?: string }) {
  const [spins, setSpins] = useState(0)
  return (
    <button
      type="button"
      aria-label="Spin the ball"
      onClick={() => setSpins((n) => n + 1)}
      className={`group block aspect-square select-none rounded-full ${className}`}
      style={{ transform: 'none' }}
    >
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full transition-transform duration-[900ms] ease-[cubic-bezier(0.2,0.9,0.2,1)] group-hover:rotate-[24deg] motion-reduce:transition-none"
        style={{ transform: `rotate(${spins * 360}deg)` }}
        aria-hidden
      >
        <defs>
          <radialGradient id="ball-shade" cx="36%" cy="30%" r="80%">
            <stop offset="0" stopColor="#ff9a52" />
            <stop offset="0.55" stopColor="#ff6a13" />
            <stop offset="1" stopColor="#b8410a" />
          </radialGradient>
          <pattern id="ball-pebble" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.9" fill="#000" fillOpacity="0.16" />
            <circle cx="5.5" cy="5.5" r="0.9" fill="#000" fillOpacity="0.16" />
          </pattern>
          <clipPath id="ball-clip">
            <circle cx="100" cy="100" r="94" />
          </clipPath>
        </defs>
        <circle cx="106" cy="106" r="94" fill="#000" fillOpacity="0.35" />
        <circle cx="100" cy="100" r="94" fill="url(#ball-shade)" />
        <circle cx="100" cy="100" r="94" fill="url(#ball-pebble)" />
        <g clipPath="url(#ball-clip)" fill="none" stroke="#1a0a02" strokeOpacity="0.85" strokeWidth="4.5" strokeLinecap="round">
          <path d="M100 4v192M4 100h192" />
          <path d="M26 24c46 38 46 114 0 152M174 24c-46 38-46 114 0 152" />
        </g>
        <circle cx="100" cy="100" r="94" fill="none" stroke="#1a0a02" strokeWidth="4.5" />
      </svg>
    </button>
  )
}
