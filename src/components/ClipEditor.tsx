import { useEffect, useState } from 'react'
import type { SongRound } from '../types'
import { createAudioSource } from '../lib/audio'
import { checkStreamAccess } from '../lib/soundcloud/soundcloud-playback'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  const n = Math.round(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

// SoundCloud restricts some tracks (access: 'preview', shown at import time) to a ~30s
// preview stream regardless of the track's real length — any clip that runs past that has
// no audio data left to play and just goes silent mid-clue.
const PREVIEW_CAP_SECONDS = 30

export default function ClipEditor({ round, onChange }: { round: SongRound; onChange: (round: SongRound) => void }) {
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const fullDuration = round.duration ?? 240
  const isPreviewOnly = round.access === 'preview'
  const duration = isPreviewOnly ? Math.min(fullDuration, PREVIEW_CAP_SECONDS) : fullDuration
  const longestClueEnd = round.clipStart + Math.max(0, ...round.clipDurations)
  const runsPastPreview = isPreviewOnly && longestClueEnd > PREVIEW_CAP_SECONDS

  // The track's `access` field (set at import time from its own metadata) reflects general
  // listenability, not whether this app's API credentials actually get a full stream —
  // private/secret-token tracks especially often report 'playable' there while only ever
  // handing back a 30s preview. Re-check against the real stream response once per round
  // (skipped once we already know it's 'preview'/'blocked') and persist the correction, so
  // the cap above reflects reality instead of stale/optimistic import-time metadata.
  useEffect(() => {
    if (round.source !== 'soundcloud' || !round.soundcloudTrackId) return
    if (round.access === 'preview' || round.access === 'blocked') return
    let active = true
    checkStreamAccess(round.soundcloudTrackId, round.soundcloudSecretToken)
      .then((access) => {
        if (active && access !== round.access) onChange({ ...round, access })
      })
      .catch(() => {
        // Best-effort background correction — if it fails (network blip, rate limit), the
        // import-time metadata just stays as-is rather than surfacing an error for something
        // the host never directly asked for.
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id])

  async function preview(index: number) {
    setPlayingIndex(index)
    setPreviewError(null)
    try {
      const source = createAudioSource(round)
      await source.play(round.clipStart, round.clipDurations[index])
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Playback failed.')
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

      {previewError && (
        <p className="mb-4 rounded-lg border border-scoreboard-500/30 bg-scoreboard-500/10 px-3 py-2 text-xs text-scoreboard-500">
          {previewError}
        </p>
      )}

      {isPreviewOnly && (
        <p className="mb-4 rounded-lg border border-scoreboard-amber/30 bg-scoreboard-amber/10 px-3 py-2 text-xs text-scoreboard-amber">
          SoundCloud only allows a {formatTime(PREVIEW_CAP_SECONDS)} preview of this track — clips can't run past that.
          {runsPastPreview && ' Your longest clue currently runs past it and will cut off silently.'}
        </p>
      )}

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
