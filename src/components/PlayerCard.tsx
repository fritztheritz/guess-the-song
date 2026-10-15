import type { PlayerProfile } from '../lib/player-profile'
import { rarityFor } from '../lib/player-card'

// A player's trading card: jersey number from their name, a rarity that rises with the number of games
// their team has won, and the four numbers that matter. Gold and holo get a foil border; holo also glints.

type Rarity = { id: 'bench' | 'starter' | 'allstar' | 'holo'; label: string; border: string; glow: string }

const RARITIES: Record<Rarity['id'], Rarity> = {
  bench: { id: 'bench', label: 'BENCH', border: 'linear-gradient(135deg,#8d9bb3,#3b4c86 50%,#8d9bb3)', glow: 'rgb(141 155 179 / 0.35)' },
  starter: { id: 'starter', label: 'STARTER', border: 'linear-gradient(135deg,#ffb680,#ff6a13 50%,#b8410a)', glow: 'rgb(255 106 19 / 0.4)' },
  allstar: { id: 'allstar', label: 'ALL-STAR', border: 'linear-gradient(135deg,#fff1b8,#ffc933 45%,#b88a00 70%,#ffe08a)', glow: 'rgb(255 201 51 / 0.45)' },
  holo: { id: 'holo', label: 'HALL OF FAME', border: 'linear-gradient(135deg,#ff6ab3,#ffc933 25%,#3fd4c2 50%,#3fa9f5 75%,#d8ff3d)', glow: 'rgb(63 212 194 / 0.5)' },
}

function jerseyNumber(name: string): number {
  let h = 0
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 100
  return h
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-black/30 pl-2">
      <div className="font-display text-2xl leading-none text-white">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">{label}</div>
    </div>
  )
}

export default function PlayerCard({ profile }: { profile: PlayerProfile }) {
  const rarity = RARITIES[rarityFor(profile.wins)]
  const num = jerseyNumber(profile.name)
  return (
    <div
      className="relative w-full max-w-[16rem] -rotate-2 rounded-2xl p-[5px] transition-transform duration-300 hover:rotate-0 hover:scale-[1.02] motion-reduce:transition-none"
      style={{ background: rarity.border, boxShadow: `6px 6px 0 0 rgb(0 0 0 / 0.5), 0 0 28px ${rarity.glow}` }}
      aria-label={`${profile.name} player card, ${rarity.label}`}
    >
      <div className="relative overflow-hidden rounded-[0.7rem] bg-arena-800">
        <div className="flex items-center justify-between bg-black/40 px-3 py-1.5 font-display text-sm tracking-widest text-white/80">
          <span>
            #{profile.rank} / {profile.ofPlayers}
          </span>
          <span className={rarity.id === 'bench' ? '' : 'text-scoreboard-amber'}>{rarity.label}</span>
        </div>

        <div className="relative h-44 overflow-hidden" style={{ background: `radial-gradient(circle at 50% 38%, ${profile.color}55, transparent 62%), var(--color-arena-700)` }}>
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgb(255 255 255 / 0.12) 0 2px, transparent 2px 14px)' }} />
          <svg viewBox="0 0 100 100" className="absolute inset-x-0 bottom-[-4%] mx-auto h-[108%]" aria-hidden>
            <path d="M32 10c4 6 8 8 18 8s14-2 18-8l22 10-8 20-10-4v54H28V36l-10 4-8-20z" fill={profile.color} stroke="#050a1c" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M42 10c3 5 5 6 8 6s5-1 8-6" fill="none" stroke="#050a1c" strokeOpacity="0.5" strokeWidth="2" />
            <text x="50" y="62" textAnchor="middle" fontSize="30" fill="#050a1c" fillOpacity="0.9" style={{ fontFamily: 'var(--font-display)' }}>
              {num}
            </text>
          </svg>
          {rarity.id === 'holo' && (
            <div
              aria-hidden
              className="player-card-sheen pointer-events-none absolute inset-0"
              style={{ backgroundImage: 'linear-gradient(115deg, transparent 30%, rgb(255 255 255 / 0.35) 45%, rgb(255 106 179 / 0.25) 52%, transparent 66%)', backgroundSize: '250% 100%' }}
            />
          )}
        </div>

        <div className="px-3 pb-3 pt-2" style={{ boxShadow: `inset 0 4px 0 ${profile.color}` }}>
          <div className="truncate pt-1 font-display text-3xl leading-none tracking-wide text-white">{profile.name}</div>
          <div className="mb-3 truncate text-xs uppercase tracking-widest text-slate-400">{profile.favoriteTeam}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <Stat label="Pts / game" value={profile.pointsPerGame.toFixed(1)} />
            <Stat label="Accuracy" value={profile.accuracy === null ? '—' : `${Math.round(profile.accuracy * 100)}%`} />
            <Stat label="Fastest" value={profile.fastestMs === undefined ? '—' : `${(profile.fastestMs / 1000).toFixed(2)}s`} />
            <Stat label="Wins" value={`${profile.wins}/${profile.games}`} />
          </div>
        </div>
      </div>
    </div>
  )
}
