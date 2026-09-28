import { Link } from 'react-router-dom'
import type { Game } from '../types'
import { isLyricMode, isTierGuessMode } from '../types'
import ModalShell from './ui/ModalShell'

export default function GamePickerModal({
  games,
  onClose,
  onPick,
}: {
  games: Game[]
  onClose: () => void
  onPick: (game: Game) => void
}) {
  return (
    <ModalShell title="ADD A GAME" subtitle="Which game should be added to this tournament?" onClose={onClose}>
      <div className="flex-1 overflow-y-auto p-4">
        {games.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-400">
            No other games available to add.{' '}
            <Link to="/new" className="text-hardwood-400 underline hover:text-hardwood-300">
              Make one from Home
            </Link>{' '}
            first, then come back here.
          </div>
        ) : (
          <div className="space-y-2">
            {games.map((game) => (
              <button
                key={game.id}
                onClick={() => onPick(game)}
                className="flex w-full items-center justify-between rounded-xl border border-arena-600 bg-arena-800/60 px-4 py-3 text-left hover:border-hardwood-500"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{isLyricMode(game) ? '📝' : isTierGuessMode(game) ? '🎯' : '🎵'}</span>
                    <div className="font-semibold text-slate-100">{game.name}</div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {game.rounds.length} possession{game.rounds.length === 1 ? '' : 's'} · {game.teams.map((t) => t.name).join(' vs ')}
                    {game.progress?.completed ? ' · Completed' : ''}
                  </div>
                </div>
                <span className="text-slate-500">→</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
