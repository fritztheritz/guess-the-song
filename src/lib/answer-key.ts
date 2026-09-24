import { isLyricMode, isTierGuessMode, type Game } from '../types'

// A plain-text answer sheet the host can keep on their own device, separate from whatever
// screen the room is looking at — the low-tech fallback to the two-window Host Controller
// mode for anyone who'd rather not deal with a second screen at all.
export function buildAnswerKeyText(game: Game): string {
  const lines: string[] = [`${game.name} — Answer Key`, `Generated ${new Date().toLocaleString()}`, '']

  game.rounds.forEach((round, i) => {
    if (isLyricMode(game)) {
      lines.push(`${i + 1}. "${round.lyricPrompt || '—'}" → "${round.lyricAnswer || '—'}"`)
      lines.push(`   ${round.title} — ${round.artist}`)
    } else if (isTierGuessMode(game)) {
      const tier = game.tierListTiers?.find((t) => t.id === round.tierId)
      lines.push(`${i + 1}. ${round.title} — ${round.artist}`)
      lines.push(`   Tier: ${tier?.name ?? '—'} · Position: #${(round.tierPosition ?? 0) + 1} of ${round.tierSize ?? '?'}`)
    } else {
      lines.push(`${i + 1}. ${round.title} — ${round.artist}`)
    }
    lines.push('')
  })

  return lines.join('\n')
}

export function downloadAnswerKey(game: Game) {
  const text = buildAnswerKeyText(game)
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${game.name.replace(/[^\w-]+/g, '_') || 'game'}-answer-key.txt`
  a.click()
  URL.revokeObjectURL(url)
}
