import { DEFAULT_POINTS, type GameMode } from '../types'
import { SCORING } from './scoring'

// One table for "what does each mode support and how does it score". The Host Controller, the
// create/builder screens and the rules card all read it, so a rule that applies to a mode is
// declared once here instead of being re-decided (and drifting) in each screen.

export type RuleMode = GameMode | 'popularity' | 'timeline'

export interface ModeRules {
  label: string
  icon: string
  /** One plain-language line on how a possession scores. */
  scoring: string
  powerUps: boolean
  /** Earn power-ups from streaks instead of a fixed stock. */
  earnedPowerUps: boolean
  catchUp: boolean
  /** 'bonus' = consecutive scores earn extra points; 'badge' = a 🔥 badge and awards only. */
  streaks: 'bonus' | 'badge'
  eject: boolean
  suddenDeath: boolean
  wager: boolean
  /** The most one team can bank from a single possession, before any bonus. */
  maxPerPossession: number
  /** Whether several teams can score the same possession, or just one. */
  scorers: 'one' | 'many'
}

export const MODE_RULES: Record<RuleMode, ModeRules> = {
  song: {
    label: 'Guess the Song',
    icon: '🎵',
    scoring: `First team to buzz and name it scores — ${DEFAULT_POINTS[0]} points cold, fewer with each extra clip.`,
    powerUps: true,
    earnedPowerUps: true,
    catchUp: true,
    streaks: 'badge',
    eject: true,
    suddenDeath: true,
    wager: true,
    maxPerPossession: DEFAULT_POINTS[0],
    scorers: 'one',
  },
  lyric: {
    label: 'Finish the Lyric',
    icon: '📝',
    scoring: `First team to buzz and finish the line scores — ${DEFAULT_POINTS[0]} points cold, fewer with each hint.`,
    powerUps: true,
    earnedPowerUps: true,
    catchUp: true,
    streaks: 'badge',
    eject: true,
    suddenDeath: true,
    wager: true,
    maxPerPossession: DEFAULT_POINTS[0],
    scorers: 'one',
  },
  tierguess: {
    label: 'Guess the Tier',
    icon: '🎯',
    scoring: `Everyone guesses together: ${SCORING.tier} for the tier, ${SCORING.position} for the closest position, +${SCORING.positionExact} for the exact one.`,
    powerUps: true,
    earnedPowerUps: true,
    catchUp: true,
    streaks: 'badge',
    eject: true,
    suddenDeath: true,
    wager: false,
    maxPerPossession: SCORING.tier + SCORING.position + SCORING.positionExact,
    scorers: 'many',
  },
  year: {
    label: 'Guess the Year',
    icon: '📅',
    scoring: `Everyone guesses together: ${SCORING.year} for the year, ${SCORING.month} for the closest month, +${SCORING.monthExact} for the exact one.`,
    powerUps: true,
    earnedPowerUps: true,
    catchUp: true,
    streaks: 'badge',
    eject: true,
    suddenDeath: true,
    wager: false,
    maxPerPossession: SCORING.year + SCORING.month + SCORING.monthExact,
    scorers: 'many',
  },
  popularity: {
    label: 'Guess the Popularity',
    icon: '📈',
    scoring: `Teams take turns placing a song: ${SCORING.popularity} points for a correct rank, plus a streak bonus up to +${SCORING.maxStreakBonus}.`,
    powerUps: false,
    earnedPowerUps: false,
    catchUp: true,
    streaks: 'bonus',
    eject: false,
    suddenDeath: false,
    wager: false,
    maxPerPossession: SCORING.popularity + SCORING.maxStreakBonus,
    scorers: 'one',
  },
  timeline: {
    label: 'Guess the Timeline',
    icon: '⏳',
    scoring: `Teams take turns placing a song: ${SCORING.timeline} points for a correct slot, plus a streak bonus up to +${SCORING.maxStreakBonus}.`,
    powerUps: false,
    earnedPowerUps: false,
    catchUp: true,
    streaks: 'bonus',
    eject: false,
    suddenDeath: false,
    wager: false,
    maxPerPossession: SCORING.timeline + SCORING.maxStreakBonus,
    scorers: 'one',
  },
}

export function rulesFor(mode: RuleMode | undefined): ModeRules {
  return MODE_RULES[mode ?? 'song']
}

/** Highest ÷ lowest `maxPerPossession` across modes — how lopsided the modes are if a game ever mixes
 *  them. Kept in a test so a scoring change that unbalances a mode is noticed. */
export function balanceSpread(): number {
  const maxes = Object.values(MODE_RULES).map((r) => r.maxPerPossession)
  return Math.max(...maxes) / Math.min(...maxes)
}
