import { useState } from 'react'
import { joinUrl } from '../lib/buzzer/join-url'

// The same join page the QR code opens, as a plain link — for anyone voting from a laptop, where
// scanning a QR code isn't an option. Shown readable, with copy and open buttons.
export default function JoinLink({ code, className = '' }: { code: string; className?: string }) {
  const url = joinUrl(code)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — the link is selectable below.
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <input
        readOnly
        value={url}
        aria-label="Join link for computers"
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-lg border border-arena-600 bg-arena-800 px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-hardwood-500"
      />
      <button onClick={copy} className="shrink-0 rounded-full border border-arena-500 px-3 py-1.5 text-xs text-slate-200 hover:border-hardwood-500">
        {copied ? '✓ Copied' : 'Copy link'}
      </button>
      <a href={url} target="_blank" rel="noreferrer" className="shrink-0 rounded-full border border-arena-500 px-3 py-1.5 text-xs text-slate-200 hover:border-hardwood-500">
        Open ↗
      </a>
    </div>
  )
}
