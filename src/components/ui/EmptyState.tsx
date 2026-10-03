import type { ReactNode } from 'react'

// The one "nothing here yet" treatment — an icon, a line of what's missing, and optionally what
// to do about it — so empty lists read the same on Home, Stats and Seasons.
export default function EmptyState({ icon = '🏀', children, action }: { icon?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-arena-600 px-6 py-8 text-center">
      <div className="text-3xl" aria-hidden>
        {icon}
      </div>
      <p className="max-w-md text-sm text-slate-400">{children}</p>
      {action}
    </div>
  )
}
