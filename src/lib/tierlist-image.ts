import type { TierList } from '../types/tierlist'
import { songsInGroup } from './tierlist-ranking'

// Drawn on a canvas like recap-card.ts, and text-only on purpose: SoundCloud artwork is
// cross-origin, and drawing it would taint the canvas and make the PNG impossible to export.

const W = 1080
const PAD = 40
const LABEL_W = 150
const ROW_PAD = 14
const LINE = 30
const TITLE_FONT = '24px Inter'

function wrap(ctx: CanvasRenderingContext2D, titles: string[], maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const title of titles) {
    const next = line ? `${line}  ·  ${title}` : title
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = title
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

export async function downloadTierListImage(list: TierList): Promise<void> {
  await document.fonts.ready
  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) return
  measure.font = TITLE_FONT

  const textW = W - PAD * 2 - LABEL_W - 28
  const rows = list.tiers
    .map((tier) => ({ tier, lines: wrap(measure, songsInGroup(list, tier.id).map((s) => s.title), textW) }))
    .filter((r) => r.lines.length > 0)
  const height = 150 + rows.reduce((sum, r) => sum + r.lines.length * LINE + ROW_PAD * 2 + 10, 0) + 60

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const bg = ctx.createLinearGradient(0, 0, 0, height)
  bg.addColorStop(0, '#0b0e14')
  bg.addColorStop(1, '#05060a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, height)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#f8fafc'
  ctx.font = '56px "Bebas Neue"'
  ctx.fillText(list.name.toUpperCase(), W / 2, 85, W - PAD * 2)
  ctx.fillStyle = '#e8871e'
  ctx.font = '20px Inter'
  ctx.fillText('TIER LIST', W / 2, 118)

  let y = 150
  for (const { tier, lines } of rows) {
    const h = lines.length * LINE + ROW_PAD * 2
    ctx.fillStyle = '#12161f'
    ctx.fillRect(PAD, y, W - PAD * 2, h)
    ctx.fillStyle = tier.color
    ctx.fillRect(PAD, y, LABEL_W, h)
    ctx.fillStyle = '#05060a'
    ctx.font = '44px "Bebas Neue"'
    ctx.textAlign = 'center'
    ctx.fillText(tier.name, PAD + LABEL_W / 2, y + h / 2 + 15, LABEL_W - 16)
    ctx.fillStyle = '#e2e8f0'
    ctx.font = TITLE_FONT
    ctx.textAlign = 'left'
    lines.forEach((line, i) => ctx.fillText(line, PAD + LABEL_W + 16, y + ROW_PAD + 22 + i * LINE))
    y += h + 10
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#64748b'
  ctx.font = '18px Inter'
  ctx.fillText(new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), W / 2, height - 24)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${list.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'tier-list'}.png`
  a.click()
  URL.revokeObjectURL(url)
}
