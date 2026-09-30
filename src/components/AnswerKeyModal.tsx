import { useState } from 'react'
import { buildAnswerKeyText, downloadAnswerKey } from '../lib/answer-key'
import type { Game } from '../types'
import ModalShell from './ui/ModalShell'
import Button from './ui/Button'

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
    <ModalShell
      title="ANSWER KEY"
      subtitle="Keep this on your own device — separate from whatever screen the room is looking at."
      onClose={onClose}
    >
      <div className="flex-1 overflow-y-auto p-4">
        <textarea
          readOnly
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          className="h-64 w-full resize-none rounded-lg border border-arena-600 bg-arena-800 p-3 font-mono text-xs text-slate-200 outline-none focus:border-hardwood-500"
        />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-arena-700 px-6 py-3">
        <Button variant="outline" size="sm" onClick={() => downloadAnswerKey(game)}>
          Download .txt
        </Button>
        <Button size="sm" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy to clipboard'}
        </Button>
      </div>
    </ModalShell>
  )
}
