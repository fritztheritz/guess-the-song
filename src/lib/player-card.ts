/** A player card's rarity by how many games their team has won: none = bench, 1–2 starter, 3–5 all-star, 6+ hall of fame. */
export type RarityId = 'bench' | 'starter' | 'allstar' | 'holo'

export function rarityFor(wins: number): RarityId {
  if (wins >= 6) return 'holo'
  if (wins >= 3) return 'allstar'
  if (wins >= 1) return 'starter'
  return 'bench'
}
