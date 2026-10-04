import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFeatureFlags } from '../state/feature-flags-context'
import { useConfirm } from '../state/confirm-context'
import { useToast } from '../state/toast-context'
import { FLAG_GROUP_ORDER, FLAG_GROUPS, RECOMMENDED_FLAGS } from '../lib/feature-flags'
import Panel from '../components/ui/Panel'
import EmptyState from '../components/ui/EmptyState'

export default function Admin() {
  const { flags, setOverride, resetOverride, refresh } = useFeatureFlags()
  const confirm = useConfirm()
  const showToast = useToast()
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () => flags.filter((f) => !q || `${f.label} ${f.key} ${f.description}`.toLowerCase().includes(q)),
    [flags, q],
  )
  // Groups in a fixed order, then anything unlisted under "Other".
  const groups = useMemo(() => {
    const names: string[] = [...FLAG_GROUP_ORDER, 'Other']
    return names
      .map((name) => ({ name, items: matches.filter((f) => (FLAG_GROUPS[f.key] ?? 'Other') === name) }))
      .filter((g) => g.items.length > 0)
  }, [matches])
  const onCount = flags.filter((f) => f.enabled).length

  return (
    <div className="min-h-svh court-lines">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl tracking-wide text-white">FEATURE FLAGS</h1>
            <p className="mt-1 text-sm text-slate-400">
              Stored in this browser only — toggling a flag here doesn't affect anyone else, so you can try something on the
              live site before it's on for everyone.
            </p>
          </div>
          <Link to="/" className="shrink-0 text-sm text-slate-400 underline hover:text-hardwood-400">
            ← Home
          </Link>
        </div>

        {flags.length === 0 ? (
          <EmptyState icon="🚩">
            No feature flags right now. When you've got something you want to try in prod without shipping it to everyone, just ask — a
            flag gets added here, defaulted off, and you can flip it on for yourself from this page.
          </EmptyState>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[14rem] flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search flags…"
                  aria-label="Search feature flags"
                  className="w-full rounded-full border border-arena-600 bg-arena-800 py-2 pl-10 pr-4 text-sm text-slate-100 outline-none focus:border-hardwood-500"
                />
              </div>
              <div className="text-sm text-slate-400" role="status">
                <span className="font-semibold text-hardwood-400">{onCount}</span> of {flags.length} on
              </div>
            </div>

            {groups.length === 0 && <EmptyState icon="🔎">No flags match "{query}".</EmptyState>}

            {groups.map((group) => (
              <section key={group.name}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {group.name}
                  <span className="ml-2 font-normal normal-case tracking-normal text-slate-600">
                    {group.items.filter((f) => f.enabled).length}/{group.items.length} on
                  </span>
                </h2>
                <div className="space-y-3">
                  {group.items.map((flag) => (
                    <Panel key={flag.key}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-100">{flag.label}</span>
                            <code className="rounded bg-arena-900 px-1.5 py-0.5 text-[11px] text-slate-500">{flag.key}</code>
                            {RECOMMENDED_FLAGS.has(flag.key) && (
                              <span className="rounded-full bg-scoreboard-green/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-scoreboard-green">
                                Recommended
                              </span>
                            )}
                            {flag.overridden && (
                              <span className="rounded-full bg-hardwood-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-hardwood-400">
                                Overridden
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-400">{flag.description}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            {flag.enabled ? 'On now' : 'Off now'} · default {flag.default ? 'on' : 'off'}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <button
                            onClick={() => setOverride(flag.key, !flag.enabled)}
                            role="switch"
                            aria-checked={flag.enabled}
                            aria-label={`Toggle ${flag.label}`}
                            className={`relative h-6 w-11 rounded-full transition-colors ${flag.enabled ? 'bg-hardwood-500' : 'bg-arena-600'}`}
                          >
                            <span
                              className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${flag.enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
                            />
                          </button>
                          {flag.overridden && (
                            <button onClick={() => resetOverride(flag.key)} className="text-xs text-slate-500 underline hover:text-slate-300">
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    </Panel>
                  ))}
                </div>
              </section>
            ))}

            <div className="flex flex-wrap items-center justify-center gap-5 pt-2 text-xs">
              <button
                onClick={() => {
                  RECOMMENDED_FLAGS.forEach((key) => flags.some((f) => f.key === key && !f.enabled) && setOverride(key, true))
                  showToast('Recommended flags turned on')
                }}
                className="text-slate-400 underline hover:text-hardwood-400"
              >
                Turn on recommended
              </button>
              <button
                onClick={async () => {
                  if (!(await confirm('Reset every flag on this device back to its default?', { confirmLabel: 'Reset' }))) return
                  flags.forEach((f) => f.overridden && resetOverride(f.key))
                  refresh()
                  showToast('Flags reset to defaults')
                }}
                className="text-slate-500 underline hover:text-slate-300"
              >
                Reset all to defaults
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
