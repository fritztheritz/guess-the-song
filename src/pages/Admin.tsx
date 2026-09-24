import { Link } from 'react-router-dom'
import { useFeatureFlags } from '../state/FeatureFlagsContext'

export default function Admin() {
  const { flags, setOverride, resetOverride, refresh } = useFeatureFlags()

  return (
    <div className="min-h-svh court-lines">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-8 flex items-center justify-between">
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
          <div className="rounded-xl border border-dashed border-arena-600 bg-arena-800/40 p-6 text-sm text-slate-400">
            No feature flags right now. When you've got something you want to try in prod without shipping it to everyone,
            just ask — a flag gets added here, defaulted off, and you can flip it on for yourself from this page. Once
            you're happy with it, ask to have the flag removed and it stops being gated for anyone.
          </div>
        ) : (
          <div className="space-y-3">
            {flags.map((flag) => (
              <div key={flag.key} className="rounded-xl border border-arena-600 bg-arena-800/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-100">{flag.label}</span>
                      <code className="rounded bg-arena-900 px-1.5 py-0.5 text-[11px] text-slate-500">{flag.key}</code>
                      {flag.overridden && (
                        <span className="rounded-full bg-hardwood-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-hardwood-400">
                          Overridden
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{flag.description}</p>
                    <p className="mt-1 text-xs text-slate-600">Default: {flag.default ? 'on' : 'off'}</p>
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
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${flag.enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
                      />
                    </button>
                    {flag.overridden && (
                      <button onClick={() => resetOverride(flag.key)} className="text-xs text-slate-500 underline hover:text-slate-300">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="pt-2 text-center">
              <button
                onClick={() => {
                  if (!confirm('Reset every flag on this device back to its default?')) return
                  flags.forEach((f) => f.overridden && resetOverride(f.key))
                  refresh()
                }}
                className="text-xs text-slate-500 underline hover:text-slate-300"
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
