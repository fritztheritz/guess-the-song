import { TEAM_AVATARS, teamColorForIndex } from '../types'

// A pool of playful team names for the "randomize" button — each with a mascot that fits.
const NAME_POOL: Array<{ name: string; avatar: string }> = [
  { name: 'Buzzer Beaters', avatar: '🏀' },
  { name: 'Net Ninjas', avatar: '⚡' },
  { name: 'Court Jesters', avatar: '🎃' },
  { name: 'Fast Breakers', avatar: '🚀' },
  { name: 'Alley-Oops', avatar: '🦁' },
  { name: 'Rim Rockers', avatar: '🔥' },
  { name: 'The Dream Team', avatar: '👑' },
  { name: 'Splash Brothers', avatar: '🌊' },
  { name: 'Triple Doubles', avatar: '🎯' },
  { name: 'Slam Dunkers', avatar: '🐐' },
  { name: 'Full Court Press', avatar: '🐺' },
  { name: 'Nothing But Net', avatar: '⭐' },
  { name: 'Bench Warmers', avatar: '👻' },
  { name: 'Hoop Dreams', avatar: '💫' },
]

/** `count` teams with distinct fun names and mascots, each in its own palette colour. */
export function randomTeams(count: number): Array<{ name: string; color: string; avatar: string }> {
  const pool = [...NAME_POOL]
  const picked: typeof NAME_POOL = []
  while (picked.length < count && pool.length > 0) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  while (picked.length < count) picked.push({ name: `Team ${picked.length + 1}`, avatar: TEAM_AVATARS[picked.length % TEAM_AVATARS.length] })
  return picked.map((t, i) => ({ ...t, color: teamColorForIndex(i) }))
}
