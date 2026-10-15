import type { ReactNode } from 'react'
import { Icon, type IconName } from '../components/Icon'

/** Emoji / glyph → icon. Anything not listed (team avatars, reactions) stays as typed. */
export const EMOJI_ICON: Record<string, IconName> = {
  '✓': 'check', '✔': 'check', '✔️': 'check', '✅': 'check-circle', '✕': 'x', '✗': 'x', '✖': 'x', '❌': 'x-circle',
  '♪': 'note', '♫': 'note', '🎵': 'note', '🎶': 'note',
  '🏀': 'ball', '🏆': 'trophy', '🔥': 'flame', '★': 'star-solid', '⭐': 'star-solid', '🎯': 'target',
  '🔎': 'search', '🔍': 'search', '🎧': 'headphones', '📱': 'phone', '👀': 'eye', '🙈': 'eye-off', '🔒': 'lock',
  '⚡': 'bolt', '📅': 'calendar', '🔔': 'bell', '🕰️': 'clock', '🕰': 'clock', '⏳': 'hourglass',
  '📈': 'trend', '🐕': 'trend', '📊': 'bars', '📋': 'clipboard', '📝': 'clipboard',
  '⚠️': 'warn', '⚠': 'warn', '🟥': 'red-card', '💀': 'skull', '🚫': 'ban', '⚙️': 'gear', '🏠': 'home', '➕': 'plus',
  '✏️': 'pencil', '✍️': 'pencil', '🚩': 'flag', '🏁': 'flag', '📡': 'wifi-off', '🔊': 'speaker', '🔉': 'speaker-low', '🔇': 'speaker-off',
  '🧊': 'snow', '🎁': 'gift', '🎡': 'wheel', '🎨': 'palette', '🎲': 'dice', '🤝': 'users', '🗳️': 'vote', '🖥️': 'monitor', '🧰': 'toolbox',
  '⬆️': 'arrow-up', '⬇️': 'arrow-down', '↕️': 'arrows-v', '🔻': 'triangle-down', '🟢': 'dot',
  '🥇': 'medal-1', '🥈': 'medal-2', '🥉': 'medal-3', '🏅': 'medal', '👑': 'crown', '🥷': 'bolt', '🪄': 'sparkle', '💥': 'sparkle', '📸': 'sparkle',
  '🎛️': 'toolbox', '💾': 'save', '🖼️': 'image', '🖼': 'image', '☁️': 'cloud', '🌐': 'globe', '🔗': 'link', '🔁': 'refresh', '📤': 'share', '📺': 'tv', '🔀': 'shuffle', '🎉': 'sparkle', '🧑‍⚖️': 'whistle',
}

const EMOJI_RE = new RegExp(
  Object.keys(EMOJI_ICON)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g',
)

/** Swaps emoji in a string for icons. A string with none comes back unchanged. */
export function withIcons(text: ReactNode): ReactNode {
  if (typeof text !== 'string' || !text) return text
  const parts: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(EMOJI_RE)) {
    const at = m.index ?? 0
    if (at > last) parts.push(text.slice(last, at))
    parts.push(<Icon key={key++} name={EMOJI_ICON[m[0]]} />)
    last = at + m[0].length
  }
  if (!parts.length) return text
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
