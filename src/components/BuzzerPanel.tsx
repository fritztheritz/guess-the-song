import type { Team } from '../types'
import type { BuzzerPlayer } from '../lib/buzzer/protocol'

function joinUrl(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}buzz/${code}`
}

// Host-only panel: shows the room code players type into /buzz, and who's connected on
// which team. Doesn't touch buzz state itself — HostController owns that (open/close tied
// to phase, winner shown inline in the reveal screen) since this is purely the "who's in
// the room" view, the buzzer equivalent of the Public Display connection indicator.
export default function BuzzerPanel({
  code,
  teams,
  roster,
  iced,
  onClose,
}: {
  code: string
  teams: Team[]
  roster: BuzzerPlayer[]
  iced: string[]
  onClose: () => void
}) {
  const url = joinUrl(code)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS) — the link is still shown/selectable.
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-arena-600 bg-arena-900 p-6 shadow-2xl"
      >
        <div className="mb-4 text-center">
          <div className="text-xs uppercase tracking-widest text-slate-500">Players join at</div>
          <div className="text-sm text-hardwood-400">{url.replace(/^https?:\/\//, '')}</div>
          <div className="mt-3 font-display text-5xl tracking-[0.3em] text-white">{code}</div>
          <button onClick={copyLink} className="mt-2 text-xs text-slate-500 underline hover:text-slate-300">
            Copy join link
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Players ({roster.length})
          </div>
          {roster.length === 0 ? (
            <p className="text-sm text-slate-500">Nobody's joined yet — have them scan or type in the code above.</p>
          ) : (
            teams.map((team) => {
              const members = roster.filter((p) => p.teamId === team.id)
              if (members.length === 0) return null
              return (
                <div key={team.id}>
                  <div className="text-xs font-medium" style={{ color: team.color }}>
                    {team.name}
                    {iced.includes(team.id) && <span className="ml-1.5 text-slate-500">🚫 iced this clue</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map((p) => (
                      <span key={p.connId} className="rounded-full bg-arena-700 px-2.5 py-1 text-xs text-slate-200">
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <button onClick={onClose} className="mt-5 w-full rounded-full border border-arena-500 py-2 text-sm text-slate-300 hover:border-hardwood-500">
          Close
        </button>
      </div>
    </div>
  )
}
