// Shared look for a numbered/choice tile on a phone picker.
export function tileClass(state: 'idle' | 'chosen' | 'taken'): string {
  const base = 'flex min-h-14 flex-col items-center justify-center rounded-xl border-2 font-display text-xl transition-transform enabled:active:scale-95'
  if (state === 'chosen') return `${base} border-hardwood-400 bg-hardwood-500/20 text-white`
  if (state === 'taken') return `${base} border-transparent bg-arena-900 text-slate-600`
  return `${base} border-arena-600 bg-arena-800 text-white`
}
