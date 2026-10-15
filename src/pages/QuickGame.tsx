import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { saveGame } from '../lib/storage/game-repository'
import { buildQuickGame, QUICK_ROUND_CHOICES, QUICK_TEAM_CHOICES, type QuickTrack } from '../lib/quick-game'
import { isSpotifyConfigured } from '../lib/spotify/config'
import { useFeatureFlag } from '../state/feature-flags-context'
import ImportSoundCloudModal from '../components/ImportSoundCloudModal'
import ImportSpotifyModal from '../components/ImportSpotifyModal'
import ErrorState from '../components/ui/ErrorState'
import Button from '../components/ui/Button'
import type { ImportableTrack } from '../lib/soundcloud/soundcloud-tracks'
import type { ImportableSpotifyTrack } from '../lib/spotify/spotify-tracks'
import { Icon } from '../components/Icon'

function Choice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-w-14 rounded-full border px-4 py-2 text-base font-semibold ${
        selected ? 'border-hardwood-500 bg-hardwood-500/15 text-hardwood-400' : 'border-arena-500 text-slate-300 hover:border-hardwood-500'
      }`}
    >
      {label}
    </button>
  )
}

// One screen from "I have a playlist" to the first clue: choose how many teams and songs, pick the
// tracks, and the game is built (random songs, intro-skipping clip starts, made-up teams) and opened.
export default function QuickGame() {
  const navigate = useNavigate()
  const [teamCount, setTeamCount] = useState<number>(2)
  const [roundCount, setRoundCount] = useState<number>(10)
  const [soundcloudOpen, setSoundcloudOpen] = useState(false)
  const [spotifyOpen, setSpotifyOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const spotifyEnabled = useFeatureFlag('spotify-import') && isSpotifyConfigured()

  function start(tracks: QuickTrack[]) {
    const game = buildQuickGame(tracks, { teamCount, roundCount })
    if (game.rounds.length === 0) {
      setError("None of those tracks can be played — pick some that aren't blocked.")
      return
    }
    const saved = saveGame(game)
    navigate(`/games/${saved.id}/present`)
  }

  const fromSoundCloud = (tracks: ImportableTrack[]) => start(tracks.map((t) => ({ ...t, source: 'soundcloud' as const })))
  const fromSpotify = (tracks: ImportableSpotifyTrack[]) => start(tracks.map((t) => ({ ...t, source: 'spotify' as const })))

  return (
    <div className="flex min-h-svh items-center justify-center court-lines px-6 py-16">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mb-2 text-4xl"><Icon name="bolt" /></div>
          <h1 className="title-page">QUICK GAME</h1>
          <p className="mt-2 text-sm text-slate-400">Pick some tracks and we'll set up the rest — random songs, clip starts and team names.</p>
        </div>

        <div>
          <div className="mb-2 text-sm text-slate-400">Teams</div>
          <div className="flex flex-wrap gap-2">
            {QUICK_TEAM_CHOICES.map((n) => (
              <Choice key={n} label={String(n)} selected={teamCount === n} onClick={() => setTeamCount(n)} />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm text-slate-400">Songs to play</div>
          <div className="flex flex-wrap gap-2">
            {QUICK_ROUND_CHOICES.map((n) => (
              <Choice key={n} label={String(n)} selected={roundCount === n} onClick={() => setRoundCount(n)} />
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Choose as many tracks as you like in the next step — {roundCount} are picked at random.</p>
        </div>

        {error && <ErrorState message={error} onDismiss={() => setError(null)} />}

        <div className="space-y-3">
          <Button size="lg" fullWidth onClick={() => setSoundcloudOpen(true)}>
            PICK FROM SOUNDCLOUD →
          </Button>
          {spotifyEnabled && (
            <Button size="lg" fullWidth variant="outline" onClick={() => setSpotifyOpen(true)}>
              PICK FROM SPOTIFY →
            </Button>
          )}
        </div>

        <p className="text-center text-xs text-slate-500">
          Want lyrics, years or a tier list instead?{' '}
          <Link to="/new" className="inline-block py-2 text-hardwood-400 underline">
            Create a full game
          </Link>
        </p>
      </div>

      {soundcloudOpen && <ImportSoundCloudModal onClose={() => setSoundcloudOpen(false)} onImport={fromSoundCloud} />}
      {spotifyOpen && <ImportSpotifyModal onClose={() => setSpotifyOpen(false)} onImport={fromSpotify} />}
    </div>
  )
}
