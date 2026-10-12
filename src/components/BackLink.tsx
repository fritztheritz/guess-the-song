import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

// The one "back to where you came from" link — same arrow, size and hover everywhere.
export default function BackLink({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={`inline-flex min-h-10 shrink-0 items-center gap-1 text-sm text-slate-400 hover:text-hardwood-400 focus-visible:text-hardwood-400 ${className}`}>
      <span aria-hidden>←</span>
      {children}
    </Link>
  )
}
