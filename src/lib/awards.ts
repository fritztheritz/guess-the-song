import { trackTeamStats } from './achievements'
import { POWER_UP_LABELS } from './host-content'
import { SCORING } from './scoring'
import { POWER_UP_KINDS, type Game, type PowerUpKind, type Team } from '../types'

// The rules for what a scored possession is worth, pulled out of the Host Controller so they can be
// tested and shared: underdog catch-up, Double/Steal, earned and gifted power-ups. Everything here
// is pure — it takes a game and returns the next one (plus the banner lines worth showing); the
// caller does the saving, sounds and recap bookkeeping.

export const leaderScore = (teams: Team[]): number => Math.max(...teams.map((t) => t.score))

/** The underdog bonus a team earns for scoring now: +1 when it trails the leader by the catch-up
 *  deficit or more, else 0. Shared by every mode that offers catch-up. */
export function underdogBonusFor(teams: Team[], team: Team, catchUp: boolean | undefined): number {
  if (!catchUp) return 0
  return leaderScore(teams) - team.score >= SCORING.underdogDeficit ? SCORING.underdogBonus : 0
}

const randomKind = (): PowerUpKind => POWER_UP_KINDS[Math.floor(Math.random() * POWER_UP_KINDS.length)]

/** First catch-up gift: any team 12+ behind that hasn't had one yet gets a free Steal. */
export function applyCatchUpGift(game: Game, powerUps: boolean): { game: Game; banners: string[] } {
  if (!game.catchUp || !powerUps) return { game, banners: [] }
  const leader = leaderScore(game.teams)
  const giftees = game.teams.filter((t) => !t.catchUpGifted && leader - t.score >= SCORING.catchUpGiftDeficit)
  if (giftees.length === 0) return { game, banners: [] }
  const ids = new Set(giftees.map((t) => t.id))
  return {
    game: {
      ...game,
      teams: game.teams.map((t) =>
        ids.has(t.id) ? { ...t, catchUpGifted: true, powerUpsGifted: { ...t.powerUpsGifted, steal: (t.powerUpsGifted?.steal ?? 0) + 1 } } : t,
      ),
    },
    banners: giftees.map((g) => `🐕 ${g.name} gets a free 🥷 Steal`),
  }
}

export interface AwardResult {
  game: Game
  /** What the scoring team actually banked (after Double and the underdog bonus). */
  points: number
  banners: string[]
}

/** Song/Lyric's single-winner score. `team` null = nobody scored (breaks everyone's streak).
 *  `basePoints` is the clue's value, or a wager's win/loss amount when `isWager` (which skips the
 *  underdog bonus — a wager is already a high-stakes swing). */
export function computeAward(
  game: Game,
  team: Team | null,
  opts: { basePoints: number; isWager?: boolean; powerUps: boolean; pickKind?: () => PowerUpKind },
): AwardResult {
  const banners: string[] = []
  const pickKind = opts.pickKind ?? randomKind
  // Armed power-ups only fire when the ARMED team is the one scoring — otherwise they stay armed
  // for whenever that team's turn comes, rather than fizzling on an unrelated possession.
  const armedKind = team ? (game.armedPowerUps?.find((a) => a.teamId === team.id)?.kind ?? null) : null
  let points = opts.basePoints
  if (armedKind === 'double') points *= 2
  if (team && points > 0 && !opts.isWager) {
    const bonus = underdogBonusFor(game.teams, team, game.catchUp)
    if (bonus > 0) {
      points += bonus
      banners.push(`🐕 Underdog bonus +${bonus} for ${team.name}`)
    }
  }
  // Steal docks whoever leads among the OTHER teams, read before this score lands.
  const stealTarget =
    armedKind === 'steal' && team ? [...game.teams].filter((t) => t.id !== team.id).sort((a, b) => b.score - a.score)[0] : undefined

  let next = game
  if (team) {
    next = {
      ...game,
      teams: game.teams.map((t) => {
        if (t.id === team.id) return { ...t, score: t.score + points, streak: points > 0 ? (t.streak ?? 0) + 1 : 0 }
        if (stealTarget && t.id === stealTarget.id) return { ...t, score: t.score - points, streak: 0 }
        return { ...t, streak: 0 }
      }),
    }
  } else {
    next = { ...game, teams: game.teams.map((t) => ({ ...t, streak: 0 })) }
  }
  if (armedKind && team) next = { ...next, armedPowerUps: (game.armedPowerUps ?? []).filter((a) => a.teamId !== team.id) }

  // Earned-power-ups games: every second scored possession in a row earns a random power-up.
  if (team && game.earnedPowerUps && points > 0 && ((team.streak ?? 0) + 1) % SCORING.earnedPowerUpEvery === 0) {
    const kind = pickKind()
    next = {
      ...next,
      teams: next.teams.map((t) => (t.id === team.id ? { ...t, powerUpsEarned: { ...t.powerUpsEarned, [kind]: (t.powerUpsEarned?.[kind] ?? 0) + 1 } } : t)),
    }
    banners.push(`${team.name} earned ${POWER_UP_LABELS[kind]}!`)
  }
  if (team) {
    const gift = applyCatchUpGift(next, opts.powerUps)
    next = gift.game
    banners.push(...gift.banners)
  }
  return { game: { ...next, teams: trackTeamStats(next.teams) }, points, banners }
}

/** Tier/Year pay several teams per possession, one credit at a time, so Double applies live to each
 *  credit (and reverses cleanly if one is toggled off). */
export function creditMultiplier(game: Game, teamId: string): number {
  return game.armedPowerUps?.some((a) => a.teamId === teamId && a.kind === 'double') ? 2 : 1
}

/** Tier/Year end-of-possession settlement. `gains` is what each team banked this possession (already
 *  doubled where Double was armed); streaks have been settled by the caller. Applies what can only
 *  be decided once the possession's total is known: the underdog bonus, Steal, earned power-ups and
 *  the catch-up gift. An armed power-up on a team that scored nothing stays armed. */
export function settleGuessPossession(
  game: Game,
  gains: Record<string, number>,
  opts: { powerUps: boolean; pickKind?: () => PowerUpKind },
): { game: Game; banners: string[] } {
  const banners: string[] = []
  const pickKind = opts.pickKind ?? randomKind
  let teams = game.teams
  const gained = (id: string) => gains[id] ?? 0

  // Underdog: measured against where everyone stood before this possession's points landed.
  if (game.catchUp) {
    const before = teams.map((t) => ({ ...t, score: t.score - gained(t.id) }))
    const leader = leaderScore(before)
    teams = teams.map((t) => {
      const pre = before.find((b) => b.id === t.id)!
      if (gained(t.id) > 0 && leader - pre.score >= SCORING.underdogDeficit) {
        banners.push(`🐕 Underdog bonus +${SCORING.underdogBonus} for ${t.name}`)
        return { ...t, score: t.score + SCORING.underdogBonus }
      }
      return t
    })
  }

  // Steal: dock the best OTHER team by what the thief banked this possession.
  let armed = game.armedPowerUps ?? []
  for (const a of armed) {
    if (gained(a.teamId) <= 0) continue
    if (a.kind === 'steal') {
      const target = [...teams].filter((t) => t.id !== a.teamId).sort((x, y) => y.score - x.score)[0]
      if (target) {
        teams = teams.map((t) => (t.id === target.id ? { ...t, score: t.score - gained(a.teamId), streak: 0 } : t))
        banners.push(`🥷 ${teams.find((t) => t.id === a.teamId)?.name} stole ${gained(a.teamId)} from ${target.name}`)
      }
    }
  }
  armed = armed.filter((a) => gained(a.teamId) <= 0)

  let next: Game = { ...game, teams, armedPowerUps: armed }
  if (game.earnedPowerUps) {
    for (const t of next.teams) {
      if (gained(t.id) > 0 && (t.streak ?? 0) > 0 && (t.streak ?? 0) % SCORING.earnedPowerUpEvery === 0) {
        const kind = pickKind()
        next = {
          ...next,
          teams: next.teams.map((x) => (x.id === t.id ? { ...x, powerUpsEarned: { ...x.powerUpsEarned, [kind]: (x.powerUpsEarned?.[kind] ?? 0) + 1 } } : x)),
        }
        banners.push(`${t.name} earned ${POWER_UP_LABELS[kind]}!`)
      }
    }
  }
  const gift = applyCatchUpGift(next, opts.powerUps)
  next = gift.game
  banners.push(...gift.banners)
  return { game: { ...next, teams: trackTeamStats(next.teams) }, banners }
}
