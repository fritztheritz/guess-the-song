import type { PowerUpKind } from '../types'
import type { SoundboardSound } from './sound-effects'

// Static text and tables for the host screen (flavor lines, labels, hotkey map) — kept out of
// HostController so that file is logic, not data.

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Flavor text only, same "fixed set, pick one at random" philosophy as Confetti's color
// palette — not host-configurable, since the point is a light surprise beat, not a setting.
export const HALFTIME_PROMPTS = [
  "Stretch it out — second half tips off in a sec.",
  "Free throw contest? Loser buys snacks next time.",
  "Check your phone. Check your score. Check your rival's face.",
  "Hydrate. Heckle. Here we go again.",
  "Somebody's about to make a comeback. Might not be you.",
]

// Flavor text for the Eject gag, same "fixed set, pick one at random" philosophy as
// HALFTIME_PROMPTS. {team} is swapped for the ejected team's name at display time.
export const EJECT_PHRASES = [
  '{team} has been shown the door!',
  'Technical foul — and {team} is OUT!',
  'Security, please escort {team} out.',
  '{team} got the hook!',
  'The ref has seen enough of {team}.',
  '{team}, hit the locker room!',
  'Two minutes in the penalty box? Nope — gone, {team}.',
]

export const PENDING_GUESSES_KEY = 'gts.pendingGuesses.v1'
export const POWER_UP_LABELS: Record<PowerUpKind, string> = { double: '2x Double', steal: '🥷 Steal', freeze: '🧊 Freeze' }


// Hotkey -> sound for the host soundboard (flag: soundboard). Letters, since digits are team buzz-ins.
export const SOUNDBOARD: Array<{ code: string; key: string; sound: SoundboardSound; icon: string; label: string }> = [
  { code: 'KeyZ', key: 'Z', sound: 'airhorn', icon: '📯', label: 'Airhorn' },
  { code: 'KeyX', key: 'X', sound: 'applause', icon: '👏', label: 'Applause' },
  { code: 'KeyC', key: 'C', sound: 'crickets', icon: '🦗', label: 'Crickets' },
  { code: 'KeyV', key: 'V', sound: 'trombone', icon: '🎺', label: 'Sad trombone' },
  { code: 'KeyB', key: 'B', sound: 'drumroll', icon: '🥁', label: 'Drumroll' },
  { code: 'KeyN', key: 'N', sound: 'rimshot', icon: '🎭', label: 'Rimshot' },
]
