import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { rankCommands, type Command } from '../lib/command-palette'
import { listGames } from '../lib/storage/game-repository'
import { listTierLists } from '../lib/storage/tierlist-repository'
import { listTournaments } from '../lib/storage/tournament-repository'
import { listDraftBoards } from '../lib/storage/draft-repository'
import { listSeasons } from '../lib/storage/season-repository'
import { listPopularityGames } from '../lib/storage/popularity-repository'
import { listTimelineGames } from '../lib/storage/timeline-repository'
import { useFeatureFlag } from '../state/feature-flags-context'
import { withIcons } from '../lib/with-icons'

// ⌘K / Ctrl+K (or "/" on Home) opens a jump-anywhere box: pages, "new …" actions and everything you've saved,
// matched by name. Content is read from storage each time it opens, so it's never stale.
export default function CommandPalette() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const tierLists = useFeatureFlag('tier-lists')
  const tournaments = useFeatureFlag('tournaments')
  const drafts = useFeatureFlag('draft')
  const popularity = useFeatureFlag('popularity')
  const timeline = useFeatureFlag('timeline')
  const seasons = useFeatureFlag('seasons')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [commands, setCommands] = useState<Command[]>([])
  const input = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const listId = useId()

  const close = useCallback(() => {
    setOpen(false)
    returnFocus.current?.focus()
  }, [])

  const openPalette = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const list: Command[] = [
      { id: 'home', label: 'Home', kind: 'Page', to: '/', icon: '🏠', keywords: 'games library' },
      { id: 'new-game', label: 'New game', kind: 'Action', to: '/new', icon: '➕', keywords: 'create' },
      { id: 'quick', label: 'Quick game', kind: 'Action', to: '/quick', icon: '⚡', keywords: 'start fast' },
      ...(tierLists ? [{ id: 'new-tier', label: 'New tier list', kind: 'Action', to: '/tierlists/new', icon: '🏆', keywords: 'create' }] : []),
      { id: 'stats', label: 'Stats', kind: 'Page', to: '/stats', icon: '📊', keywords: 'leaderboard awards' },
      { id: 'settings', label: 'Settings', kind: 'Page', to: '/settings', icon: '⚙️', keywords: 'sound volume theme' },
      { id: 'flags', label: 'Feature flags', kind: 'Page', to: '/admin', icon: '🚩', keywords: 'admin' },
    ]
    for (const g of listGames()) {
      list.push({ id: `g-${g.id}`, label: g.name, kind: 'Game', to: `/games/${g.id}/present`, icon: '🎵', keywords: 'present play host' })
      list.push({ id: `ge-${g.id}`, label: `Edit ${g.name}`, kind: 'Game', to: `/games/${g.id}/edit`, icon: '✏️', keywords: 'builder' })
    }
    if (tierLists)
      for (const l of listTierLists()) {
        list.push({ id: `t-${l.id}`, label: l.name, kind: 'Tier list', to: `/tierlists/${l.id}/present`, icon: '🏆', keywords: 'rank present' })
        list.push({ id: `tb-${l.id}`, label: `Blind ranking: ${l.name}`, kind: 'Tier list', to: `/tierlists/${l.id}/rank-together`, icon: '🙈', keywords: 'blind rank game' })
      }
    if (tournaments) for (const t of listTournaments()) list.push({ id: `to-${t.id}`, label: t.name, kind: 'Tournament', to: `/tournaments/${t.id}`, icon: '🏅' })
    if (drafts) for (const b of listDraftBoards()) list.push({ id: `d-${b.id}`, label: b.name, kind: 'Draft', to: `/drafts/${b.id}`, icon: '🎧' })
    if (seasons) for (const s of listSeasons()) list.push({ id: `s-${s.id}`, label: s.name, kind: 'Season', to: `/seasons/${s.id}`, icon: '📅' })
    if (popularity) for (const g of listPopularityGames()) list.push({ id: `p-${g.id}`, label: g.name, kind: 'Popularity', to: `/popularity/${g.id}/present`, icon: '📈' })
    if (timeline) for (const g of listTimelineGames()) list.push({ id: `tm-${g.id}`, label: g.name, kind: 'Timeline', to: `/timeline/${g.id}/present`, icon: '🕰️' })
    setCommands(list)
    setQuery('')
    setActive(0)
    setOpen(true)
  }, [tierLists, tournaments, drafts, popularity, timeline, seasons])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) close()
        else openPalette()
        return
      }
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]')
      if (e.key === '/' && !typing && !open && pathname === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        openPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, openPalette, pathname])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  const results = useMemo(() => rankCommands(commands, query), [commands, query])

  function go(cmd: Command) {
    setOpen(false)
    navigate(cmd.to)
  }

  if (!open) return null
  const clamped = Math.min(active, Math.max(0, results.length - 1))

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 px-4 pt-[12vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-arena-500 bg-arena-900 shadow-2xl"
      >
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              close()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive(Math.min(results.length - 1, clamped + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive(Math.max(0, clamped - 1))
            } else if (e.key === 'Enter' && results[clamped]) {
              e.preventDefault()
              go(results[clamped])
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[clamped] ? `${listId}-${results[clamped].id}` : undefined}
          aria-label="Search games, tier lists and pages"
          placeholder="Jump to a game, tier list or page…"
          className="w-full border-b border-arena-700 bg-transparent px-4 py-3.5 text-base text-white outline-none placeholder:text-slate-500"
        />
        <ul id={listId} role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Nothing matches “{query}”.</li>}
          {results.map((cmd, i) => (
            <li
              key={cmd.id}
              id={`${listId}-${cmd.id}`}
              role="option"
              aria-selected={i === clamped}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(cmd)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${i === clamped ? 'bg-hardwood-500/15 text-white' : 'text-slate-300'}`}
            >
              <span aria-hidden className="w-6 text-center">
                {withIcons(cmd.icon)}
              </span>
              <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
              <span className="shrink-0 text-xs text-slate-500">{cmd.kind}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-4 border-t border-arena-700 px-4 py-2 text-xs text-slate-500">
          <span>↑↓ choose</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
