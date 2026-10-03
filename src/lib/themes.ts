import { isFlagEnabled } from './feature-flags'

// Venue skins: a theme is just a set of CSS-variable overrides for the palette declared in
// index.css's @theme block (Tailwind v4 compiles every bg-arena-*/text-hardwood-* utility to
// var(--color-…), so overriding them on <html> re-skins the whole app with no per-component
// work). Dark palettes only — the UI's text colors are hard-coded light-on-dark.

export interface ThemePreset {
  id: string
  name: string
  emoji: string
  vars: Record<string, string>
}

const SERIF_DISPLAY = "'Playfair Display', Georgia, 'Times New Roman', serif"

function palette(base: [string, string, string, string, string, string], accent: [string, string, string]): Record<string, string> {
  return {
    '--color-arena-950': base[0],
    '--color-arena-900': base[1],
    '--color-arena-800': base[2],
    '--color-arena-700': base[3],
    '--color-arena-600': base[4],
    '--color-arena-500': base[5],
    '--color-hardwood-500': accent[0],
    '--color-hardwood-400': accent[1],
    '--color-hardwood-300': accent[2],
  }
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'arena', name: 'Arena', emoji: '🏀', vars: {} },
  {
    id: 'holiday',
    name: 'Holiday',
    emoji: '🎄',
    vars: palette(['#040a06', '#08120b', '#0e1c12', '#16291b', '#223c28', '#345a3d'], ['#e04848', '#f06a6a', '#ffa3a3']),
  },
  {
    id: 'barnight',
    name: 'Bar Night',
    emoji: '🍻',
    vars: palette(['#08040f', '#0e0819', '#160d26', '#20143a', '#321f58', '#4b3180'], ['#ff3d9a', '#ff6ab3', '#ffa1d0']),
  },
  {
    id: 'beach',
    name: 'Beach Party',
    emoji: '🏖️',
    vars: palette(['#030b12', '#071622', '#0c2133', '#123049', '#1d4668', '#2e6490'], ['#ff7a59', '#ff9a7d', '#ffc2ae']),
  },
  {
    id: 'halloween',
    name: 'Halloween',
    emoji: '🎃',
    vars: palette(['#08040a', '#100810', '#1a0e1a', '#26142a', '#3a2042', '#55306a'], ['#ff7a1a', '#ff9a4d', '#ffc08a']),
  },
  {
    id: 'wedding',
    name: 'Black Tie',
    emoji: '🥂',
    vars: { ...palette(['#0a0809', '#131011', '#1c1819', '#2a2425', '#403839', '#5e5253'], ['#d9b26f', '#e6c78f', '#f2dfb8']), '--font-display': SERIF_DISPLAY },
  },
]

export interface CustomTheme {
  /** Background tint — the six arena shades are derived from this hue. */
  base: string
  /** Accent color (buttons, highlights). */
  accent: string
  serif: boolean
}

export interface ThemeSelection {
  id: string // a preset id, or 'custom'
  custom?: CustomTheme
}

export const DEFAULT_CUSTOM: CustomTheme = { base: '#1d2a4a', accent: '#e8871e', serif: false }

function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0x1d2a4a
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l * 100]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [(h * 60 + 360) % 360, s * 100, l * 100]
}

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(Math.min(96, Math.max(2, l)))}%)`

function customVars(c: CustomTheme): Record<string, string> {
  const [bh, bs] = hexToHsl(c.base)
  const sat = Math.min(bs, 45)
  const [ah, as, al] = hexToHsl(c.accent)
  const lights = [3, 6, 9, 13, 19, 28]
  const names = ['950', '900', '800', '700', '600', '500']
  const vars: Record<string, string> = {}
  names.forEach((n, i) => (vars[`--color-arena-${n}`] = hsl(bh, sat, lights[i])))
  vars['--color-hardwood-500'] = hsl(ah, as, al)
  vars['--color-hardwood-400'] = hsl(ah, as, al + 8)
  vars['--color-hardwood-300'] = hsl(ah, as, al + 18)
  if (c.serif) vars['--font-display'] = SERIF_DISPLAY
  return vars
}

export function resolveThemeVars(sel: ThemeSelection): Record<string, string> {
  if (sel.id === 'custom') return customVars(sel.custom ?? DEFAULT_CUSTOM)
  return THEME_PRESETS.find((p) => p.id === sel.id)?.vars ?? {}
}

const STORAGE_KEY = 'gts.theme.v1'

export function getStoredTheme(): ThemeSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ThemeSelection
      if (parsed && typeof parsed.id === 'string') return parsed
    }
  } catch {
    // Unreadable/unavailable storage — fall back to the default skin.
  }
  return { id: 'arena' }
}

export function saveTheme(sel: ThemeSelection) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sel))
  } catch {
    // Storage unavailable — the skin just won't persist past this tab.
  }
}

let appliedKeys: string[] = []

/** Sets exactly these CSS variables on <html>, clearing whatever a previous theme set. */
export function applyThemeVars(vars: Record<string, string>) {
  const root = document.documentElement
  for (const key of appliedKeys) root.style.removeProperty(key)
  appliedKeys = Object.keys(vars)
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value)
}

/** Startup + cross-tab sync: applies the saved skin, but only while the Themes flag is on. */
export function applyStoredTheme() {
  applyThemeVars(isFlagEnabled('themes') ? resolveThemeVars(getStoredTheme()) : {})
}

/** What a host sends down to guests' phones so the whole room matches the venue skin. */
export function currentThemeVarsForGuests(): Record<string, string> | undefined {
  if (!isFlagEnabled('themes')) return undefined
  const vars = resolveThemeVars(getStoredTheme())
  return Object.keys(vars).length > 0 ? vars : undefined
}
