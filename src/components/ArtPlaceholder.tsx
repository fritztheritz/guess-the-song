// Stand-in cover art for a song with none of its own. Not a grey box: one of six little illustrations
// (vinyl, cassette, jersey patch, ticket stub, equaliser, sunburst), picked and coloured from a hash of
// the title, so the same song always gets the same cover and a list of them looks like a record crate.

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const PALETTES = [
  { bg: '#ff6a13', fg: '#050a1c', accent: '#ffe2c4' },
  { bg: '#17b8a6', fg: '#050a1c', accent: '#c9fff6' },
  { bg: '#d8ff3d', fg: '#050a1c', accent: '#f5ffc7' },
  { bg: '#ffb703', fg: '#050a1c', accent: '#fff0c2' },
  { bg: '#f472b6', fg: '#050a1c', accent: '#ffd9ec' },
  { bg: '#3fa9f5', fg: '#050a1c', accent: '#d3edff' },
]

type Palette = (typeof PALETTES)[number]

function Vinyl({ p }: { p: Palette }) {
  return (
    <>
      <rect width="100" height="100" fill="#0f1938" />
      <circle cx="50" cy="50" r="42" fill="#050a1c" stroke="#26366a" strokeWidth="1.5" />
      {[36, 30, 24].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#17234a" strokeWidth="1.2" />
      ))}
      <path d="M50 8a42 42 0 0 1 36 21" fill="none" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="50" r="15" fill={p.bg} />
      <circle cx="50" cy="50" r="2.4" fill="#050a1c" />
    </>
  )
}

function Cassette({ p }: { p: Palette }) {
  return (
    <>
      <rect width="100" height="100" fill={p.bg} />
      <rect x="9" y="22" width="82" height="56" rx="5" fill="#050a1c" />
      <rect x="15" y="27" width="70" height="26" rx="2" fill={p.accent} />
      <path d="M20 40h60" stroke={p.fg} strokeWidth="1.4" strokeDasharray="3 3" />
      <circle cx="33" cy="64" r="7" fill="none" stroke={p.accent} strokeWidth="2" />
      <circle cx="67" cy="64" r="7" fill="none" stroke={p.accent} strokeWidth="2" />
      <path d="M41 70h18" stroke={p.accent} strokeWidth="2" />
    </>
  )
}

function Patch({ p, letter }: { p: Palette; letter: string }) {
  return (
    <>
      <rect width="100" height="100" fill="#0f1938" />
      <path d="M50 9l33 9v26c0 24-14 38-33 47C31 82 17 68 17 44V18z" fill={p.bg} stroke={p.accent} strokeWidth="2.5" />
      <path d="M50 16l26 7v21c0 19-11 31-26 38-15-7-26-19-26-38V23z" fill="none" stroke={p.fg} strokeWidth="1.5" strokeDasharray="3 2.5" />
      <text x="50" y="62" textAnchor="middle" fontSize="38" fill={p.fg} style={{ fontFamily: 'var(--font-display)' }}>
        {letter}
      </text>
    </>
  )
}

function Ticket({ p, letter }: { p: Palette; letter: string }) {
  return (
    <>
      <rect width="100" height="100" fill="#0f1938" />
      <path d="M8 26h84v15a6 6 0 0 0 0 18v15H8V59a6 6 0 0 0 0-18z" fill={p.bg} />
      <path d="M68 26v48" stroke={p.fg} strokeWidth="1.6" strokeDasharray="3 3" />
      <text x="38" y="62" textAnchor="middle" fontSize="40" fill={p.fg} style={{ fontFamily: 'var(--font-display)' }}>
        {letter}
      </text>
      <path d="M76 36h10M76 46h10M76 56h10" stroke={p.fg} strokeWidth="2.4" strokeLinecap="round" />
    </>
  )
}

function Equaliser({ p, seed }: { p: Palette; seed: number }) {
  const bars = Array.from({ length: 7 }, (_, i) => 22 + ((seed >> (i * 3)) % 7) * 8)
  return (
    <>
      <rect width="100" height="100" fill="#0f1938" />
      {bars.map((h, i) => (
        <rect key={i} x={10 + i * 12} y={88 - h} width="8" height={h} rx="1.5" fill={i % 2 ? p.bg : p.accent} />
      ))}
      <path d="M6 90h88" stroke={p.bg} strokeWidth="2" />
    </>
  )
}

function Sunburst({ p }: { p: Palette }) {
  return (
    <>
      <rect width="100" height="100" fill={p.bg} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        const b = ((i + 0.5) / 12) * Math.PI * 2
        return <path key={i} d={`M50 50L${50 + 80 * Math.cos(a)} ${50 + 80 * Math.sin(a)}L${50 + 80 * Math.cos(b)} ${50 + 80 * Math.sin(b)}z`} fill={p.accent} fillOpacity="0.55" />
      })}
      <circle cx="50" cy="50" r="19" fill="#050a1c" />
      <circle cx="50" cy="50" r="19" fill="none" stroke={p.accent} strokeWidth="2" />
      <path d="M44 41v18l15-9z" fill={p.bg} />
    </>
  )
}

export default function ArtPlaceholder({ seed }: { seed: string }) {
  const h = hash(seed.trim().toLowerCase() || 'song')
  const p = PALETTES[h % PALETTES.length]
  const kind = (h >> 4) % 6
  const letter = (seed.trim().match(/[A-Za-z0-9]/)?.[0] ?? '♪').toUpperCase()
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="block h-full w-full" aria-hidden>
      {kind === 0 && <Vinyl p={p} />}
      {kind === 1 && <Cassette p={p} />}
      {kind === 2 && <Patch p={p} letter={letter} />}
      {kind === 3 && <Ticket p={p} letter={letter} />}
      {kind === 4 && <Equaliser p={p} seed={h} />}
      {kind === 5 && <Sunburst p={p} />}
    </svg>
  )
}
