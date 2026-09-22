import { useState, type FormEvent } from 'react'
import { LYRIC_CLUE_LABELS, type SongRound } from '../types'
import { useSoundCloud } from '../state/SoundCloudContext'
import { resolveSoundCloudUrl } from '../lib/soundcloud/soundcloud-tracks'
import { SoundCloudApiError, SoundCloudNotConnectedError } from '../lib/soundcloud/soundcloud-api'

function clampPoints(value: number, fallback: number): number {
  const n = Math.round(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(99, n)) : fallback
}

export default function LyricEditor({ round, onChange }: { round: SongRound; onChange: (round: SongRound) => void }) {
  const { connection, isConfigured, connect } = useSoundCloud()
  const [pasteUrl, setPasteUrl] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const clues = round.lyricClues ?? ['', '', '', '']

  function updateClue(index: number, value: string) {
    const next = [...clues]
    next[index] = value
    onChange({ ...round, lyricClues: next })
  }

  function updatePoints(index: number, value: number) {
    const next = [...round.points]
    next[index] = clampPoints(value, round.points[index])
    onChange({ ...round, points: next })
  }

  async function handleResolve(e: FormEvent) {
    e.preventDefault()
    if (!pasteUrl.trim()) return
    setResolving(true)
    setResolveError(null)
    try {
      const track = await resolveSoundCloudUrl(pasteUrl.trim())
      onChange({
        ...round,
        title: track.title,
        artist: track.artist,
        artworkUrl: track.artworkUrl,
        isPrivate: track.isPrivate,
      })
      setPasteUrl('')
    } catch (err) {
      setResolveError(
        err instanceof SoundCloudNotConnectedError
          ? 'Connect SoundCloud to auto-fill from a link.'
          : err instanceof SoundCloudApiError
            ? err.message
            : 'Could not resolve that link.',
      )
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-arena-600 bg-arena-800/40 p-3">
        <div className="mb-1 text-xs font-medium text-slate-400">
          Optional — paste a SoundCloud track link to auto-fill the title, artist & artwork above
        </div>
        {!isConfigured ? (
          <div className="text-xs text-slate-500">SoundCloud isn't configured for this app — skip this, or type everything in manually.</div>
        ) : connection ? (
          <form onSubmit={handleResolve} className="flex gap-2">
            <input
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="https://soundcloud.com/…"
              className="flex-1 rounded-lg border border-arena-600 bg-arena-800 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-hardwood-500"
            />
            <button
              disabled={resolving || !pasteUrl.trim()}
              className="shrink-0 rounded-lg bg-hardwood-500 px-3 py-1.5 text-sm font-medium text-arena-950 disabled:opacity-40 hover:bg-hardwood-400"
            >
              {resolving ? 'Loading…' : 'Fill in'}
            </button>
          </form>
        ) : (
          <button onClick={connect} className="text-sm text-hardwood-400 hover:text-hardwood-300">
            Connect SoundCloud →
          </button>
        )}
        {resolveError && <div className="mt-2 text-xs text-scoreboard-500">{resolveError}</div>}
      </div>

      <div className="rounded-xl border border-arena-600 bg-arena-800/60 p-4">
        <div className="mb-3 text-sm font-medium text-slate-300">Clues, in reveal order</div>
        <div className="space-y-3">
          {LYRIC_CLUE_LABELS.map((label, i) => (
            <div key={label} className="flex items-start gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-500">{label}</label>
                {i < 2 ? (
                  <textarea
                    value={clues[i] ?? ''}
                    onChange={(e) => updateClue(i, e.target.value)}
                    rows={2}
                    placeholder={`Type ${label.toLowerCase()}…`}
                    className="w-full resize-none rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-hardwood-500"
                  />
                ) : (
                  <input
                    value={clues[i] ?? ''}
                    onChange={(e) => updateClue(i, e.target.value)}
                    placeholder={`Type ${label.toLowerCase()}…`}
                    className="w-full rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-hardwood-500"
                  />
                )}
              </div>
              <div className="pt-5">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={round.points[i] ?? 0}
                  onChange={(e) => updatePoints(i, Number(e.target.value))}
                  className="w-12 rounded-md border border-arena-600 bg-arena-800 px-1 py-1 text-center text-sm text-slate-300 outline-none focus:border-hardwood-500"
                  aria-label={`${label} points`}
                />
                <div className="mt-0.5 text-center text-[10px] text-slate-500">pts</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-arena-700 pt-3">
          <label className="mb-1 block text-xs text-slate-500">Playlist link (optional — shown on reveal)</label>
          <input
            value={round.playlistUrl ?? ''}
            onChange={(e) => onChange({ ...round, playlistUrl: e.target.value })}
            placeholder="https://soundcloud.com/…/sets/…"
            className="w-full rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-hardwood-500"
          />
        </div>
      </div>
    </div>
  )
}
