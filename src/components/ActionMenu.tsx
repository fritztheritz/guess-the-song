import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { withIcons } from '../lib/with-icons'

export interface MenuItem {
  key: string
  label: ReactNode
  /** Router link target (use `external` for a new tab). */
  to?: string
  external?: boolean
  onSelect?: () => void
  /** Marks a toggle-style item that is currently on. */
  checked?: boolean
  hidden?: boolean
  title?: string
}

// One dropdown for secondary actions, so a toolbar can keep its primary buttons and tuck the rest away.
// Closes on outside click, Escape and selection; Escape returns focus to the trigger.
export default function ActionMenu({ label, items, className = '' }: { label: ReactNode; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const visible = items.filter((i) => !i.hidden)
  if (visible.length === 0) return null
  const itemClass = 'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-200 hover:bg-arena-700 focus-visible:bg-arena-700'

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-arena-500 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:border-hardwood-500"
      >
        {label}
        <span aria-hidden className="text-[10px] text-slate-500">
          ▾
        </span>
      </button>
      {open && (
        <div id={id} role="menu" className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-arena-500 bg-arena-800 py-1 shadow-xl">
          {visible.map((item) =>
            item.to ? (
              <Link
                key={item.key}
                role="menuitem"
                to={item.to}
                title={item.title}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                {withIcons(item.label)}
              </Link>
            ) : (
              <button
                key={item.key}
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                title={item.title}
                onClick={() => {
                  item.onSelect?.()
                  setOpen(false)
                }}
                className={itemClass}
              >
                {withIcons(item.label)}
                {item.checked && <span aria-hidden><Icon name="check" /></span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
