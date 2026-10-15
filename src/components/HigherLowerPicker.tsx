import type { PhoneRoundState } from '../lib/buzzer/protocol'
import { PhoneBanner } from './PhoneParts'
import { withIcons } from '../lib/with-icons'
import { Icon } from './Icon'

type Card = NonNullable<PhoneRoundState['higherLower']>

function SongCard({ title, artist, artworkUrl, badge }: { title: string; artist: string; artworkUrl?: string; badge: string }) {
  return (
    <div className="flex w-28 flex-col items-center gap-1">
      <div className="h-20 w-20 overflow-hidden rounded-xl bg-arena-700">{artworkUrl ? <img src={artworkUrl} alt="" className="h-full w-full object-cover" /> : null}</div>
      <div className="w-full truncate text-xs font-semibold text-slate-100">{title}</div>
      <div className="w-full truncate text-xs text-slate-500">{artist}</div>
      <div className="font-display text-xl text-hardwood-400">{badge}</div>
    </div>
  )
}

// Phone side of Higher or Lower: the card to beat (its rank is public), the mystery song, and two big
// buttons. Once revealed, shows the real rank and whether the pick was right.
export default function HigherLowerPicker({
  card,
  phase,
  picked,
  onPick,
}: {
  card: Card
  phase: PhoneRoundState['phase']
  /** What this phone already sent this round, if anything. */
  picked: string | null
  onPick: (guess: 'higher' | 'lower') => void
}) {
  const revealed = phase === 'revealed' && card.answer !== undefined
  const right = revealed && picked?.toLowerCase() === card.answer
  return (
    <div className="w-full max-w-xs space-y-4">
      <div className="flex items-start justify-center gap-3">
        <SongCard title={card.refTitle} artist={card.refArtist} artworkUrl={card.refArtworkUrl} badge={`#${card.refRank}`} />
        <div className="pt-8 font-display text-xl text-slate-600">VS</div>
        <SongCard title={card.title} artist={card.artist} artworkUrl={card.artworkUrl} badge={revealed ? `#${card.rank}` : '#?'} />
      </div>

      {revealed ? (
        <PhoneBanner tone={right ? 'good' : 'neutral'} title={<>{card.answer === 'higher' ? <><Icon name="arrow-up" /> HIGHER</> : <><Icon name="arrow-down" /> LOWER</>} — #{card.rank} of {card.size}</>}>
          {picked ? (right ? 'You called it!' : 'Not this time.') : 'No call from you this round.'}
        </PhoneBanner>
      ) : (
        <>
          <p className="text-sm text-slate-300">
            Is <span className="font-semibold text-white">{card.title}</span> ranked higher or lower than {card.refTitle}?
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(['higher', 'lower'] as const).map((choice) => {
              const on = picked?.toLowerCase() === choice
              return (
                <button
                  key={choice}
                  onClick={() => onPick(choice)}
                  aria-pressed={on}
                  className={`flex min-h-24 flex-col items-center justify-center rounded-2xl border-2 font-display text-2xl tracking-wide ${
                    on ? 'border-hardwood-500 bg-hardwood-500/20 text-hardwood-400' : 'border-arena-600 bg-arena-800 text-white'
                  }`}
                >
                  <span className="text-3xl">{choice === 'higher' ? withIcons('⬆️') : withIcons('⬇️')}</span>
                  {on ? withIcons('✓ ') : ''}
                  {choice === 'higher' ? 'HIGHER' : 'LOWER'}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-500">Higher = closer to #1 of {card.size}. Tap again to change your mind.</p>
        </>
      )}
    </div>
  )
}
