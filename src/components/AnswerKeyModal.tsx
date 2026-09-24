import { useState } from 'react'
import { buildAnswerKeyText, downloadAnswerKey } from '../lib/answer-key'
import type { Game } from '../types'

export default function AnswerKeyModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = buildAnswerKeyText(game)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write can fail (permissions, insecure context) — the textarea below is
      // already selectable as a manual fallback, so this just silently no-ops.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-arena-600 bg-arena-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-arena-700 px-6 py-4">
          <div>
            <h2 className="font-display text-2xl tracking-wide text-hardwood-400">ANSWER KEY</h2>
            <p className="text-sm text-slate-400">
              Keep this on your own device — separate from whatever screen the room is looking at.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-arena-700 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <textarea
            readOnly
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            className="h-64 w-full resize-none rounded-lg border border-arena-600 bg-arena-800 p-3 font-mono text-xs text-slate-200 outline-none"
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-arena-700 px-6 py-3">
          <button
            onClick={() => downloadAnswerKey(game)}
            className="rounded-full border border-arena-500 px-4 py-2 text-sm text-slate-300 hover:border-hardwood-500"
          >
            Download .txt
          </button>
          <button onClick={copy} className="rounded-full bg-hardwood-500 px-4 py-2 text-sm font-semibold text-arena-950 hover:bg-hardwood-400">
            {copied ? 'Copied ✓' : 'Copy to clipboard'}
          </button>
        </div>
      </div>
    </div>
  )
}
