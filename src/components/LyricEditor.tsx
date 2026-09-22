import { useState, type FormEvent } from 'react'
import { LYRIC_HINT_LABELS, type SongRound } from '../types'
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

  // Stage 0 ("no hints") has no text of its own — it's just lyricPrompt alone, worth
  // points[0]. Stages 1-3 are these 3 hints, worth points[1..3] respectively.
  const hints = [
    { label: LYRIC_HINT_LABELS[0], value: round.artist, set: (v: string) => onChange({ ...round, artist: v }) },
    { label: LYRIC_HINT_LABELS[1], value: round.playlistHint ?? '', set: (v: string) => onChange({ ...round, playlistHint: v }) },
    { label: LYRIC_HINT_LABELS[2], value: round.title, set: (v: string) => onChange({ ...round, title: v }) },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-arena-600 bg-arena-800/40 p-3">
        <div className="mb-1 text-xs font-medium text-slate-400">
          Optional — paste a SoundCloud track link to auto-fill "who sang it" & "song name" below, plus artwork
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
        <div className="mb-1 text-sm font-medium text-slate-300">The lyric</div>
        <div className="mb-3 text-xs text-slate-500">Line 1 is shown first as the prompt. Players guess line 2, which is revealed as the answer.</div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Lyric line 1 (the prompt)</label>
            <textarea
              value={round.lyricPrompt ?? ''}
              onChange={(e) => onChange({ ...round, lyricPrompt: e.target.value })}
              rows={2}
              placeholder="Type the first line…"
              className="w-full resize-none rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-hardwood-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Lyric line 2 (the answer)</label>
            <textarea
              value={round.lyricAnswer ?? ''}
              onChange={(e) => onChange({ ...round, lyricAnswer: e.target.value })}
              rows={2}
              placeholder="Type the line players are guessing…"
              className="w-full resize-none rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-hardwood-500"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-arena-600 bg-arena-800/60 p-4">
        <div className="mb-3 text-sm font-medium text-slate-300">Hints, in reveal order</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-arena-700 bg-arena-800/50 px-3 py-2">
            <div className="text-sm text-slate-400">No hints — guessing cold</div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={99}
                value={round.points[0] ?? 0}
                onChange={(e) => updatePoints(0, Number(e.target.value))}
                className="w-12 rounded-md border border-arena-600 bg-arena-800 px-1 py-1 text-center text-sm text-slate-300 outline-none focus:border-hardwood-500"
                aria-label="No-hints points"
              />
              <span className="text-xs text-slate-500">pts</span>
            </div>
          </div>

          {hints.map((hint, i) => (
            <div key={hint.label} className="flex items-start gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-500">{hint.label}</label>
                <input
                  value={hint.value}
                  onChange={(e) => hint.set(e.target.value)}
                  placeholder={`Type ${hint.label.toLowerCase()}`}
                  className="w-full rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-hardwood-500"
                />
              </div>
              <div className="pt-5">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={round.points[i + 1] ?? 0}
                  onChange={(e) => updatePoints(i + 1, Number(e.target.value))}
                  className="w-12 rounded-md border border-arena-600 bg-arena-800 px-1 py-1 text-center text-sm text-slate-300 outline-none focus:border-hardwood-500"
                  aria-label={`${hint.label} points`}
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
