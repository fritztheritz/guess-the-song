import type { ReactNode } from 'react'
import Spot from '../Spot'
import { spotFor } from '../../lib/spot-for'

// The one "nothing here yet" treatment — a small illustrated scene, a line of what's missing, and
// optionally what to do about it — so empty lists read the same on Home, Stats and Seasons. `icon` is
// the emoji the call site was written with; it just picks which scene to draw.
export default function EmptyState({ icon = '🏀', children, action }: { icon?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-arena-600 px-6 py-7 text-center">
      <Spot name={spotFor(icon)} />
      <p className="max-w-md text-sm text-slate-400">{children}</p>
      {action}
    </div>
  )
}
