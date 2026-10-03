export type ButtonVariant = 'primary' | 'outline' | 'accent-outline' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

// The chrome every button in the app already converges on (pill shape, disabled dimming,
// hover color shift) — pulled out so that converges stays true instead of drifting screen by
// screen. `className` still merges in, for the one-off flourishes (font-display sizing on hero
// CTAs, shrink-0, etc.) that don't belong in a shared default.
export const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-hardwood-500 text-arena-950 hover:bg-hardwood-400',
  outline: 'border border-arena-500 text-slate-200 hover:border-hardwood-500',
  'accent-outline': 'border border-hardwood-500 text-hardwood-400 hover:bg-hardwood-500/10',
  danger: 'bg-scoreboard-500 text-arena-950 hover:bg-scoreboard-400',
}

export const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-4 py-1.5 text-sm',
  md: 'px-6 py-2.5',
  lg: 'py-3 text-lg',
}
