import { Link } from 'react-router-dom'
import type { Game } from '../types'
import { isLyricMode, isTierGuessMode } from '../types'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-arena-600 bg-arena-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-arena-700 px-6 py-4">
          <div>
            <h2 className="font-display text-2xl tracking-wide text-hardwood-400">ADD A GAME</h2>
            <p className="text-sm text-slate-400">Which game should be added to this tournament?</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-arena-700 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

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
      </div>
    </div>
  )
}
