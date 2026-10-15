// Small spot illustrations for "nothing here" and "something broke" moments — drawn in the same
// stroke language as the icons, in the app's own colours, so an empty list is a little scene rather than a
// caption under an emoji. Each is a 120 × 90 drawing sitting on a floor line.

const SLATE = 'var(--color-slate-500)'
const ORANGE = 'var(--color-hardwood-500)'
const FILL = 'var(--color-arena-700)'

export type SpotName = 'bench' | 'ball' | 'search' | 'board' | 'ref'

function Floor() {
  return <path d="M8 80h104" stroke={SLATE} strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 7" />
}

const SCENES: Record<SpotName, React.ReactNode> = {
  // An empty bench: a towel over the seat, a water bottle, nobody sitting.
  bench: (
    <>
      <Floor />
      <rect x="18" y="52" width="84" height="9" rx="2" fill={FILL} stroke={SLATE} />
      <path d="M28 61v19M92 61v19M28 70h64" stroke={SLATE} />
      <path d="M40 52c0-9 15-9 15 0" fill={ORANGE} fillOpacity="0.25" stroke={ORANGE} />
      <path d="M46 52v8M50 52v8" stroke={ORANGE} />
      <rect x="76" y="34" width="10" height="18" rx="2.5" fill={FILL} stroke={SLATE} />
      <path d="M78.5 34v-4h5v4" stroke={ORANGE} />
    </>
  ),
  // A flat ball, hissing.
  ball: (
    <>
      <Floor />
      <ellipse cx="58" cy="68" rx="36" ry="12" fill={ORANGE} fillOpacity="0.2" stroke={ORANGE} />
      <path d="M22 68h72M58 56v24M38 58c5 6 5 16 0 20M78 58c-5 6-5 16 0 20" stroke={ORANGE} strokeOpacity="0.8" />
      <path d="M98 54c5-3 9-1 9-8M101 63h9M97 45c3-2 5-6 3-9" stroke={SLATE} />
    </>
  ),
  // A ball and a magnifying glass: nothing matched.
  search: (
    <>
      <Floor />
      <circle cx="46" cy="46" r="26" fill={ORANGE} fillOpacity="0.15" stroke={ORANGE} />
      <path d="M46 20v52M20 46h52M29 30c8 8 8 24 0 32M63 30c-8 8-8 24 0 32" stroke={ORANGE} strokeOpacity="0.8" />
      <circle cx="78" cy="52" r="16" fill="var(--color-arena-900)" fillOpacity="0.7" stroke="var(--color-pop-400)" strokeWidth="3" />
      <path d="M90 64l16 14" stroke="var(--color-pop-400)" strokeWidth="5" />
      <path d="M72 48c1-3 4-5 7-5" stroke={SLATE} />
    </>
  ),
  // A coach's clipboard with a play drawn on it — blank until there's data.
  board: (
    <>
      <Floor />
      <rect x="32" y="12" width="56" height="66" rx="4" fill={FILL} stroke={SLATE} />
      <rect x="48" y="7" width="24" height="9" rx="3" fill={ORANGE} fillOpacity="0.3" stroke={ORANGE} />
      <path d="M44 34l10 10M54 34L44 44" stroke={ORANGE} />
      <circle cx="76" cy="39" r="6" stroke={SLATE} />
      <path d="M46 64c14-16 26-4 36-18M82 46l-8 0M82 46l-1 8" stroke={SLATE} strokeDasharray="4 4" />
    </>
  ),
  // A whistle and a red card: the page took a foul.
  ref: (
    <>
      <Floor />
      <rect x="64" y="14" width="26" height="38" rx="3" transform="rotate(12 77 33)" fill="#ff3b3b" stroke="#050a1c" />
      <circle cx="42" cy="56" r="17" fill={FILL} stroke={SLATE} />
      <path d="M54 46l26-12v14H66" stroke={SLATE} />
      <circle cx="42" cy="56" r="4" fill="var(--color-arena-900)" stroke={ORANGE} />
      <path d="M26 36c-6-3-10-9-9-16" stroke={ORANGE} strokeDasharray="2 5" />
    </>
  ),
}

export default function Spot({ name, className = 'h-24 w-auto' }: { name: SpotName; className?: string }) {
  return (
    <svg viewBox="0 0 120 90" className={className} aria-hidden fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {SCENES[name]}
    </svg>
  )
}
