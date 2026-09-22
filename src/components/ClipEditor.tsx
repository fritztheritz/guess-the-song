import { useState } from 'react'
import type { SongRound } from '../types'
import { createAudioSource } from '../lib/audio'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {round.clipDurations.map((clueDuration, i) => (
          <button
            key={i}
            onClick={() => preview(i)}
            disabled={playingIndex !== null}
            className={`flex flex-col items-center rounded-lg border py-2 text-sm ${
              playingIndex === i ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600 hover:border-arena-500'
            } disabled:opacity-60`}
          >
            <span className="font-display text-lg text-hardwood-400">{playingIndex === i ? '■' : '▶'} {clueDuration}s</span>
            <span className="text-xs text-slate-500">{round.points[i]} pts</span>
          </button>
        ))}
      </div>
    </div>
  )
}
