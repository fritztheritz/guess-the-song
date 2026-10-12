import { useState } from 'react'
import { REACTION_EMOJIS } from '../lib/buzzer/protocol'

// A phone's row of reaction buttons. Tapping one sends it; a short cooldown on the phone matches the
// room's own limit, so a button mashed faster than the room accepts doesn't look like it worked.
export default function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  const [cooling, setCooling] = useState(false)
  const [last, setLast] = useState<string | null>(null)
  return (
    <div className="w-full max-w-xs" aria-label="Send a reaction">
      <div className="flex justify-between gap-1">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            disabled={cooling}
            onClick={() => {
              onReact(emoji)
              navigator.vibrate?.(15)
              setLast(emoji)
              setCooling(true)
              setTimeout(() => setCooling(false), 650)
            }}
            aria-label={`React ${emoji}`}
            className={`flex h-12 w-12 items-center justify-center rounded-full bg-arena-800 text-2xl transition active:scale-90 disabled:opacity-60 ${
              last === emoji && cooling ? 'ring-2 ring-hardwood-500' : ''
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
