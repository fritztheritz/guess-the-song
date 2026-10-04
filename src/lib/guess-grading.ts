import { MONTH_NAMES } from './host-content'
import { parseGuessNumber } from './scoring'

// How typed/tapped Tier and Year guesses are judged — pure, so the credit rules (closest, exact,
// ties, Double) can be tested without a screen. The Host Controller applies the results.

/** "Mar", "march" or "3" → 3; null when it isn't a month. */
export function monthNumber(text: string): number | null {
  const t = text.trim().toLowerCase()
  const asNumber = parseGuessNumber(t)
  if (asNumber !== null) return asNumber
  const idx = MONTH_NAMES.findIndex((m) => t.length >= 3 && m.toLowerCase().startsWith(t.slice(0, 3)))
  return idx >= 0 ? idx + 1 : null
}

/** Whether a guess names exactly the revealed position (phones send the 1-based number, "#3" works). */
export function isExactPosition(text: string, tierPosition: number | undefined): boolean {
  return tierPosition !== undefined && text.trim().replace(/^#/, '') === String(tierPosition + 1)
}

/** Whether a guess names exactly the release month — a number or a 3+ letter month name. */
export function isExactMonth(text: string, releaseMonth: number | undefined): boolean {
  if (!releaseMonth) return false
  const t = text.trim().toLowerCase()
  return t === String(releaseMonth) || (t.length >= 3 && MONTH_NAMES[releaseMonth - 1].toLowerCase().startsWith(t.slice(0, 3)))
}

/** Matcher for "closest to the answer" among everything submitted — ties all count, and a guess
 *  that isn't a number never matches. */
export function closestMatcher(texts: string[], answer: number, toNumber: (text: string) => number | null): (text: string) => boolean {
  const distances = texts.map((t) => {
    const n = toNumber(t)
    return n === null ? null : Math.abs(n - answer)
  })
  const best = Math.min(...distances.filter((d): d is number => d !== null))
  return (text) => {
    const n = toNumber(text)
    return n !== null && Math.abs(n - answer) === best
  }
}

export interface GuessInput {
  teamId: string
  name: string
  text: string
}

export interface Grade {
  /** Teams already credited for this grade (never credited twice). */
  credited: Set<string>
  points: number
  /** Overrides the shared matcher for this grade (e.g. closest vs exact). */
  match?: (text: string) => boolean
  label: string
}

export interface GradedGuess {
  guess: GuessInput
  /** Whether it matched the shared matcher — null when accuracy isn't being tracked. */
  isMatch: boolean | null
  credits: Array<{ worth: number; label: string }>
}

export interface GradeResult {
  /** Points per team, after each team's multiplier. */
  deltas: Record<string, number>
  /** Labels of what each team earned, for the banner. */
  earned: Record<string, string[]>
  /** The grades' credited sets, with this round's new credits added. */
  nextSets: Set<string>[]
  events: GradedGuess[]
}

/** Grades every guess against `match` and each grade's own matcher. A team is credited at most
 *  once per grade however many guesses it sent; `multiplier` is how much a credit is worth to a
 *  team (Double power-up). */
export function gradeGuesses(
  guesses: GuessInput[],
  match: (text: string) => boolean,
  grades: Grade[],
  opts: { accuracy: boolean; multiplier: (teamId: string) => number },
): GradeResult {
  const nextSets = grades.map((g) => new Set(g.credited))
  const deltas: Record<string, number> = {}
  const earned: Record<string, string[]> = {}
  const events: GradedGuess[] = []
  for (const guess of guesses) {
    const event: GradedGuess = { guess, isMatch: opts.accuracy ? match(guess.text) : null, credits: [] }
    grades.forEach((g, i) => {
      if (!(g.match ?? match)(guess.text) || nextSets[i].has(guess.teamId)) return
      nextSets[i].add(guess.teamId)
      const worth = g.points * opts.multiplier(guess.teamId)
      deltas[guess.teamId] = (deltas[guess.teamId] ?? 0) + worth
      ;(earned[guess.teamId] ??= []).push(worth > g.points ? `2x ${g.label}` : g.label)
      event.credits.push({ worth, label: g.label })
    })
    events.push(event)
  }
  return { deltas, earned, nextSets, events }
}
