import { useState } from 'react'
import {
  DEFAULT_CUSTOM,
  THEME_PRESETS,
  applyThemeVars,
  getStoredTheme,
  resolveThemeVars,
  saveTheme,
  type CustomTheme,
  type ThemeSelection,
} from '../lib/themes'

// Applies live as you pick (so you see the venue skin on this very modal) and saves each
// choice immediately — there's no separate "apply" step to forget.
export default function ThemePicker({ onClose }: { onClose: () => void }) {
  const [selection, setSelection] = useState<ThemeSelection>(() => getStoredTheme())
  const custom: CustomTheme = selection.custom ?? DEFAULT_CUSTOM

  function choose(next: ThemeSelection) {
    setSelection(next)
    saveTheme(next)
    applyThemeVars(resolveThemeVars(next))
  }

  function updateCustom(patch: Partial<CustomTheme>) {
    choose({ id: 'custom', custom: { ...custom, ...patch } })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-arena-600 bg-arena-900 p-6 shadow-2xl">
        <div className="mb-1 font-display text-2xl tracking-wide text-white">VENUE THEME</div>
        <p className="mb-4 text-xs text-slate-500">Re-skins the whole app — the Public Display and guests' phones follow along during a game.</p>

        <div className="grid grid-cols-3 gap-2">
          {THEME_PRESETS.map((preset) => {
            const swatch = preset.vars['--color-hardwood-500'] ?? '#e8871e'
            const bg = preset.vars['--color-arena-700'] ?? '#1a2030'
            const active = selection.id === preset.id
            return (
              <button
                key={preset.id}
                onClick={() => choose({ id: preset.id })}
                className={`rounded-xl border-2 px-2 py-3 text-center text-xs font-semibold text-slate-200 ${
                  active ? 'border-hardwood-500' : 'border-arena-600 hover:border-arena-500'
                }`}
                style={{ background: bg }}
              >
                <div className="text-2xl">{preset.emoji}</div>
                <div className="mt-1">{preset.name}</div>
                <div className="mx-auto mt-1.5 h-1.5 w-8 rounded-full" style={{ background: swatch }} />
              </button>
            )
          })}
        </div>

        <div className={`mt-3 rounded-xl border-2 p-3 ${selection.id === 'custom' ? 'border-hardwood-500' : 'border-arena-600'}`}>
          <div className="mb-2 text-sm font-semibold text-slate-200">🎨 Custom</div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-2">
              Background
              <input type="color" value={custom.base} onChange={(e) => updateCustom({ base: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-arena-600 bg-transparent" />
            </label>
            <label className="flex items-center gap-2">
              Accent
              <input type="color" value={custom.accent} onChange={(e) => updateCustom({ accent: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-arena-600 bg-transparent" />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={custom.serif} onChange={(e) => updateCustom({ serif: e.target.checked })} className="h-4 w-4 accent-hardwood-500" />
              Serif headings
            </label>
          </div>
        </div>

        <button onClick={onClose} className="mt-5 w-full rounded-full border border-arena-500 py-2 text-sm text-slate-300 hover:border-hardwood-500">
          Done
        </button>
      </div>
    </div>
  )
}
