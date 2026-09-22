import { useState } from 'react'
import type { SongRound } from '../types'
import { createAudioSource } from '../lib/audio'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  const n = Math.round(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

export default function ClipEditor({ round, onChange }: { round: SongRound; onChange: (round: SongRound) => void }) {
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)
  const duration = round.duration ?? 240

  async function preview(index: number) {
    setPlayingIndex(index)
    try {
      const source = createAudioSource(round)
      await source.play(round.clipStart, round.clipDurations[index])
    } finally {
      setPlayingIndex(null)
    }
  }

  function updateDuration(index: number, value: number) {
    const next = [...round.clipDurations]
    next[index] = clamp(value, 1, 60, round.clipDurations[index])
    onChange({ ...round, clipDurations: next })
  }

  function updatePoints(index: number, value: number) {
    const next = [...round.points]
    next[index] = clamp(value, 0, 99, round.points[index])
    onChange({ ...round, points: next })
  }

  return (
    <div className="rounded-xl border border-arena-600 bg-arena-800/60 p-4">
      <div className="mb-1 text-sm font-medium text-slate-300">Clip Timeline</div>

      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, duration - 1)}
        step={1}
        value={round.clipStart}
        onChange={(e) => onChange({ ...round, clipStart: Number(e.target.value) })}
        className="w-full accent-hardwood-500"
      />
      <div className="mb-4 text-center text-sm text-slate-400">
        Start: <span className="font-mono text-hardwood-400">{formatTime(round.clipStart)}</span>
      </div>

      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-300">Clues</div>
        <div className="text-xs text-slate-500">duration & points, per clue</div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {round.clipDurations.map((clueDuration, i) => (
          <div
            key={i}
            className={`rounded-lg border p-2 text-center ${
              playingIndex === i ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600'
            }`}
          >
            <div className="flex items-center justify-center gap-1">
              <input
                type="number"
                min={1}
                max={60}
                value={clueDuration}
                onChange={(e) => updateDuration(i, Number(e.target.value))}
                className="w-9 bg-transparent text-center font-display text-lg text-hardwood-400 outline-none"
                aria-label={`Clue ${i + 1} duration in seconds`}
              />
              <span className="text-xs text-slate-500">s</span>
              <button
                onClick={() => preview(i)}
                disabled={playingIndex !== null}
                className="ml-1 shrink-0 text-hardwood-400 hover:text-hardwood-300 disabled:opacity-40"
                aria-label={playingIndex === i ? 'Stop preview' : `Preview clue ${i + 1}`}
              >
                {playingIndex === i ? '■' : '▶'}
              </button>
            </div>
            <div className="mt-1 flex items-center justify-center gap-1">
              <input
                type="number"
                min={0}
                max={99}
                value={round.points[i]}
                onChange={(e) => updatePoints(i, Number(e.target.value))}
                className="w-7 bg-transparent text-center text-xs text-slate-400 outline-none"
                aria-label={`Clue ${i + 1} points`}
              />
              <span className="text-xs text-slate-500">pts</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
