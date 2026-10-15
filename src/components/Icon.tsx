import type { ReactNode } from 'react'

// One hand-built icon family for the whole app: 24-unit grid, chunky 2.25 stroke, round caps — drawn to
// sit next to the display type — instead of whatever each OS's emoji font happens to draw. `Icon` renders
// one by name (`lib/with-icons` swaps emoji inside strings for these).

const MEDAL_COLORS = { 1: '#ffc933', 2: '#c9d3e3', 3: '#d4833c' } as const

function medal(n: 1 | 2 | 3): ReactNode {
  return (
    <>
      <path d="M7 2.5l5 7.5 5-7.5" stroke="currentColor" />
      <circle cx="12" cy="15" r="7.5" fill={MEDAL_COLORS[n]} stroke="#050a1c" strokeWidth="1.5" />
      <text x="12" y="19" textAnchor="middle" fontSize="11.5" fontWeight="800" fill="#050a1c" stroke="none" style={{ fontFamily: 'var(--font-display)' }}>
        {n}
      </text>
    </>
  )
}

interface Def {
  node: ReactNode
  /** Solid shapes: fill with currentColor too. */
  fill?: boolean
  /** Keeps its own colours (medals, status dots) instead of following the text colour. */
  keepColor?: boolean
}

const DEFS = {
  check: { node: <path d="M4.5 12.5l5 5L19.5 6.5" /> },
  x: { node: <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" /> },
  'check-circle': { node: <><circle cx="12" cy="12" r="9" /><path d="M7.8 12.4l3 3 5.4-6" /></> },
  'x-circle': { node: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></> },
  note: { node: <><path d="M9 17.5V5.5l11-2.2v12" /><circle cx="6.3" cy="17.6" r="2.8" /><circle cx="17.3" cy="15.4" r="2.8" /></> },
  ball: { node: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18M5.6 5.4c3.4 3.2 3.4 10 0 13.2M18.4 5.4c-3.4 3.2-3.4 10 0 13.2" /></> },
  trophy: { node: <><path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z" /><path d="M7 5.5H4v1.2a3.3 3.3 0 0 0 3.2 3.3M17 5.5h3v1.2a3.3 3.3 0 0 1-3.2 3.3M12 14v4M8 20.5h8" /></> },
  flame: { node: <path d="M12 2.8c.6 3.6 5.4 5.7 5.4 10.4a5.4 5.4 0 0 1-10.8 0c0-2.2 1-3.4 2.2-4.6.3 1.6 1 2.4 2.2 2.6-.6-3.4-.4-5.4 1-8.4z" /> },
  star: { node: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /> },
  'star-solid': { node: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />, fill: true },
  target: { node: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /></> },
  search: { node: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5l5.5 5.5" /></> },
  headphones: { node: <><path d="M4 16v-3.5a8 8 0 0 1 16 0V16" /><path d="M4 15.5h3.2v5H5.5A1.5 1.5 0 0 1 4 19zM20 15.5h-3.2v5h1.7a1.5 1.5 0 0 0 1.5-1.5z" /></> },
  phone: { node: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.8 18.5h2.4" /></> },
  eye: { node: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></> },
  'eye-off': { node: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /><path d="M4 4l16 16" /></> },
  lock: { node: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></> },
  bolt: { node: <path d="M13.5 2.5L5 13.5h6l-1.5 8L19 10h-6z" /> },
  calendar: { node: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></> },
  bell: { node: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l2 2H4z" /><path d="M10 21.5h4" /></> },
  clock: { node: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.5 2.2" /></> },
  hourglass: { node: <path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" /> },
  trend: { node: <path d="M3 20.5h18M4.5 16l5-5.5 3.5 3L20 6M15 6h5v5" /> },
  bars: { node: <path d="M5 20.5V12M12 20.5V4M19 20.5v-6" /> },
  clipboard: { node: <><rect x="5" y="4.5" width="14" height="17" rx="2" /><path d="M9 4.5v-1h6v1M8.5 11h7M8.5 15h5" /></> },
  warn: { node: <><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.4v.1" /></> },
  'red-card': { node: <rect x="7" y="3" width="10" height="18" rx="1.6" fill="#ff3b3b" stroke="#050a1c" />, keepColor: true },
  skull: { node: <><path d="M12 3a8 8 0 0 0-5 14.2V20.5h10v-3.3A8 8 0 0 0 12 3z" /><circle cx="9" cy="11.5" r="1.4" fill="currentColor" /><circle cx="15" cy="11.5" r="1.4" fill="currentColor" /><path d="M10 20.5v-2.2M14 20.5v-2.2" /></> },
  ban: { node: <><circle cx="12" cy="12" r="9" /><path d="M5.7 5.7l12.6 12.6" /></> },
  gear: { node: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /><circle cx="12" cy="12" r="6.2" /></> },
  home: { node: <path d="M3.5 11.5L12 3.5l8.5 8M6 10v10.5h12V10M10 20.5v-5.5h4v5.5" /> },
  plus: { node: <path d="M12 5v14M5 12h14" /> },
  pencil: { node: <path d="M4 20.5l1-4.5L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19zM14.5 6.5l3 3" /> },
  flag: { node: <path d="M6 21.5V3.5M6 4.5h11.5l-2.3 3.8 2.3 3.7H6" /> },
  'wifi-off': { node: <><path d="M3 9.2a14 14 0 0 1 18 0M6 12.7a9.5 9.5 0 0 1 12 0M9 16.2a5 5 0 0 1 6 0M12 19.6v.1M4 4l16 16" /></> },
  speaker: { node: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.2a8 8 0 0 1 0 11.6" /></> },
  'speaker-low': { node: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /></> },
  'speaker-off': { node: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></> },
  snow: { node: <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.5L12 6.5l2.5-2M9.5 19.5L12 17.5l2.5 2" /> },
  gift: { node: <><rect x="4" y="10" width="16" height="10.5" rx="1" /><path d="M3 6.8h18V10H3zM12 6.8v13.7M12 6.8C9 6.8 7.6 3 10.2 3c2.2 0 1.8 3.8 1.8 3.8zm0 0c3 0 4.4-3.8 1.8-3.8-2.2 0-1.8 3.8-1.8 3.8z" /></> },
  wheel: { node: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><path d="M12 3v7M12 14v7M3 12h7M14 12h7M5.6 5.6l5 5M13.4 13.4l5 5M18.4 5.6l-5 5M10.6 13.4l-5 5" /></> },
  palette: { node: <><path d="M12 3a9 9 0 1 0 0 18c1.6 0 2.1-1.1 1.5-2.2-.6-1.2.2-2.5 1.7-2.5H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3z" /><circle cx="7.5" cy="11" r="1.1" fill="currentColor" /><circle cx="10.5" cy="7" r="1.1" fill="currentColor" /><circle cx="15.5" cy="7.5" r="1.1" fill="currentColor" /></> },
  dice: { node: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.2" fill="currentColor" /><circle cx="15" cy="9" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="9" cy="15" r="1.2" fill="currentColor" /><circle cx="15" cy="15" r="1.2" fill="currentColor" /></> },
  users: { node: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M16.5 5.2a3 3 0 0 1 0 5.6M18 14.2a6 6 0 0 1 3.5 5.8" /></> },
  vote: { node: <><path d="M4 13.5h16v7H4zM8.5 13.5L9.5 9h5l1 4.5" /><path d="M10.5 6.2l1.4 1.4 2.6-2.8" /></> },
  monitor: { node: <><rect x="3" y="4" width="18" height="12.5" rx="2" /><path d="M9 20.5h6M12 16.5v4" /></> },
  toolbox: { node: <><rect x="3" y="8" width="18" height="12.5" rx="2" /><path d="M9 8V5h6v3M3 13.5h18M11 12.5h2v2h-2z" /></> },
  'arrow-up': { node: <path d="M12 20V5M6 11l6-6 6 6" /> },
  'arrow-down': { node: <path d="M12 4v15M6 13l6 6 6-6" /> },
  'arrows-v': { node: <path d="M12 3v18M7.5 7.5L12 3l4.5 4.5M7.5 16.5L12 21l4.5-4.5" /> },
  'triangle-down': { node: <path d="M5 7h14l-7 11z" />, fill: true },
  dot: { node: <circle cx="12" cy="12" r="6" fill="#2bd47d" stroke="none" />, keepColor: true },
  medal: { node: <><path d="M8 2.5l4 7 4-7" /><circle cx="12" cy="15" r="6.5" /></> },
  'medal-1': { node: medal(1), keepColor: true },
  'medal-2': { node: medal(2), keepColor: true },
  'medal-3': { node: medal(3), keepColor: true },
  crown: { node: <path d="M3.5 18.5l-1-11 5.5 4.5L12 5l4 7 5.5-4.5-1 11z" /> },
  megaphone: { node: <><path d="M4 10v4h3l8 4.5v-13L7 10z" /><path d="M18.5 9.5a4 4 0 0 1 0 5" /></> },
  save: { node: <path d="M4 4h13l3 3v13H4zM8 4v5h8V4M8 20v-6h8v6" /> },
  image: { node: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M3 17l5-5 4 4 3-3 6 5" /></> },
  cloud: { node: <path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10.5a4 4 0 0 1-.5 8z" /> },
  globe: { node: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></> },
  link: { node: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /> },
  refresh: { node: <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" /> },
  share: { node: <path d="M12 15V3.5M7.5 7.5L12 3l4.5 4.5M5 13v7.5h14V13" /> },
  tv: { node: <><rect x="3" y="6.5" width="18" height="13" rx="2" /><path d="M8 2.5l4 4 4-4" /></> },
  shuffle: { node: <path d="M3 7h4c4 0 6 10 10 10h4M3 17h4c1.5 0 2.7-1 3.7-2.5M13.5 9C14.5 8 15.7 7 17 7h4M18 4l3 3-3 3M18 14l3 3-3 3" /> },
  whistle: { node: <><circle cx="9" cy="14" r="5.5" /><path d="M13.5 10.2L21 7v4.5h-5M9 12.2v.1" /></> },
  sparkle: { node: <path d="M12 3c.8 4.6 2.4 6.2 7 7-4.6.8-6.2 2.4-7 7-.8-4.6-2.4-6.2-7-7 4.6-.8 6.2-2.4 7-7z" /> },
} satisfies Record<string, Def>

export type IconName = keyof typeof DEFS

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const def: Def = DEFS[name]
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`inline-block h-[1.1em] w-[1.1em] shrink-0 align-[-0.2em] ${className}`}
      fill={def.fill ? 'currentColor' : 'none'}
      stroke={def.keepColor ? undefined : 'currentColor'}
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {def.node}
    </svg>
  )
}
