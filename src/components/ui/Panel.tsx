import type { HTMLAttributes, ReactNode } from 'react'

// The bordered-card chrome used everywhere (song pool tiles, roster cards, settings sections)
// had drifted into a dozen near-identical border/bg/padding combos across pages. This is the
// one shape; `highlight` is the one state variation (e.g. "it's this drafter's turn").
const PADDING_CLASSES = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
} as const

export default function Panel({
  padding = 'md',
  highlight,
  className = '',
  children,
  ...rest
}: {
  padding?: keyof typeof PADDING_CLASSES
  highlight?: boolean
  className?: string
  children: ReactNode
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border ${highlight ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600 bg-arena-800/60'} ${PADDING_CLASSES[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
