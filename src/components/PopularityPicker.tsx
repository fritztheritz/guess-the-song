import { useEffect, useState } from 'react'
import type { PhoneRoundState } from '../lib/buzzer/protocol'

type PopularityState = NonNullable<PhoneRoundState['popularity']>

// Phone-side half of Guess the Popularity: shows whose turn it is and, when it's this
// phone's team, a filter-as-you-type list of the artist's songs to tap. The host page is the
// one that decides right/wrong — this just names a track id and waits for the next sync.
export default function PopularityPicker({
  state,
  teams,
  myTeamId,
  onPick,
}: {
  state: PopularityState
  teams: PhoneRoundState['teams']
  myTeamId: string | undefined
  onPick: (trackId: string) => void
}) {
  const [filter, setFilter] = useState('')
  const [secondsLeft, setSecondsLeft] = useState<number | null>(state.turnSecondsLeft)

  // The host sends the seconds left as of the sync; count down locally from receipt
  // (no shared clock between the two devices to compare an absolute end time against).
  useEffect(() => {
    if (state.turnSecondsLeft === null) return
    const endsAt = Date.now() + state.turnSecondsLeft * 1000
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [state.turnSecondsLeft])

  const turnTeam = teams.find((t) => t.id === state.turnTeamId)
  const myTurn = !!myTeamId && myTeamId === state.turnTeamId
  const tried = new Set(state.tried)
  const q = filter.trim().toLowerCase()
  const options = q ? state.pool.filter((t) => t.title.toLowerCase().includes(q)) : state.pool

  function pick(id: string) {
    navigator.vibrate?.(30)
    setFilter('')
    onPick(id)
  }

  return (
    <div className="w-full space-y-3">
      {state.lastResult && (
        <div
          className={`rounded-lg px-3 py-2 text-xs font-semibold ${
            state.lastResult.correct ? 'bg-scoreboard-green/15 text-scoreboard-green' : 'bg-scoreboard-500/15 text-scoreboard-500'
          }`}
        >
          {state.lastResult.timedOut
            ? `${state.lastResult.teamName}: ⏱ out of time`
            : `${state.lastResult.teamName}: "${state.lastResult.title}" ${state.lastResult.correct ? '✓' : '✗'}`}
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-widest text-slate-500">Rank #{state.rank}</div>
        <div className="font-display text-xl" style={{ color: turnTeam?.color }}>
          {myTurn ? "It's your team's turn!" : `${turnTeam?.avatar ? `${turnTeam.avatar} ` : ''}${turnTeam?.name ?? '…'}'s turn`}
        </div>
        {secondsLeft !== null && (
          <div className={`scoreboard-digit font-display text-2xl ${secondsLeft <= 5 ? 'text-scoreboard-500' : 'text-slate-300'}`}>
            {secondsLeft}s
          </div>
        )}
      </div>

      {myTurn ? (
        <>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter songs…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-arena-600 bg-arena-800 px-4 py-3 text-center text-white outline-none focus:border-hardwood-500"
          />
          <div className="max-h-72 space-y-1.5 overflow-y-auto text-left">
            {options.map((t) => {
              const alreadyTried = tried.has(t.id)
              return (
                <button
                  key={t.id}
                  disabled={alreadyTried}
                  onClick={() => pick(t.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                    alreadyTried
                      ? 'cursor-not-allowed border-arena-700 bg-arena-800/30 text-slate-500 opacity-50'
                      : 'border-arena-600 bg-arena-800 text-slate-100 active:border-hardwood-500'
                  }`}
                >
                  <span className="truncate">{t.title}</span>
                  {alreadyTried && <span className="shrink-0 text-xs">tried</span>}
                </button>
              )
            })}
            {options.length === 0 && <p className="py-3 text-center text-sm text-slate-500">No matches.</p>}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-400">Hang tight — your team's up after this one.</p>
      )}
    </div>
  )
}
