// Hand-drawn via Canvas 2D rather than a screenshot/html2canvas library — same "no bundled
// assets, synthesize it" philosophy as sound-effects.ts, and it means the card's layout is
// fully under our control instead of a DOM-to-pixel snapshot of whatever's on screen.

export interface RecapCardTeam {
  name: string
  color: string
  avatar?: string
  score: number
}

export interface RecapCardStats {
  winningMargin: number | null
  biggest: { points: number; teamName: string; roundTitle: string } | null
  fastestBuzz: { name: string; teamName: string; ms: number } | null
  correctCount: number
  noScoreCount: number
}

export interface RecapCardData {
  gameName: string
  /** Winner first. */
  teams: RecapCardTeam[]
  stats: RecapCardStats
}

const SIZE = 1080
const COLORS = {
  bgTop: '#0b0e14',
  bgBottom: '#05060a',
  cardBg: '#12161f',
  hardwood: '#e8871e',
  hardwoodLight: '#f4a13f',
  slate: '#94a3b8',
  slateDim: '#64748b',
  white: '#f8fafc',
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let result = text
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1)
  }
  return `${result}…`
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'game'
}

function draw(ctx: CanvasRenderingContext2D, data: RecapCardData) {
  const bg = ctx.createLinearGradient(0, 0, 0, SIZE)
  bg.addColorStop(0, COLORS.bgTop)
  bg.addColorStop(1, COLORS.bgBottom)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)

  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.hardwoodLight
  ctx.font = '600 28px Inter'
  ctx.fillText('🏀 BUZZER BEATS', SIZE / 2, 90)

  ctx.fillStyle = COLORS.white
  ctx.font = '76px "Bebas Neue"'
  ctx.fillText(truncate(ctx, data.gameName.toUpperCase(), SIZE - 120), SIZE / 2, 175)

  ctx.fillStyle = COLORS.hardwood
  ctx.font = '600 26px Inter'
  ctx.fillText('FINAL SCORE', SIZE / 2, 225)

  const rowsTop = 270
  const rowGap = 14
  const rowHeight = Math.max(56, Math.min(96, Math.floor((640 - rowsTop) / data.teams.length) - rowGap))
  let y = rowsTop

  ctx.textBaseline = 'middle'
  for (const [i, team] of data.teams.entries()) {
    ctx.fillStyle = COLORS.cardBg
    roundRect(ctx, 80, y, SIZE - 160, rowHeight, 18)
    ctx.fill()
    ctx.fillStyle = team.color
    ctx.fillRect(80, y + rowHeight - 6, SIZE - 160, 6)

    const label = `${i === 0 ? '🏆 ' : ''}${team.avatar ? `${team.avatar} ` : ''}${team.name}`
    ctx.textAlign = 'left'
    ctx.fillStyle = team.color
    ctx.font = `600 ${rowHeight > 70 ? 34 : 26}px Inter`
    ctx.fillText(truncate(ctx, label, SIZE - 360), 110, y + rowHeight / 2 - 3)

    ctx.textAlign = 'right'
    ctx.fillStyle = COLORS.white
    ctx.font = `${rowHeight > 70 ? 46 : 34}px "Bebas Neue"`
    ctx.fillText(String(team.score), SIZE - 110, y + rowHeight / 2 - 3)

    y += rowHeight + rowGap
  }
  ctx.textBaseline = 'alphabetic'

  let statY = y + 30
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.hardwood
  ctx.font = '600 22px Inter'
  ctx.fillText('RECAP', SIZE / 2, statY)
  statY += 44

  const lines: string[] = []
  if (data.stats.winningMargin !== null) lines.push(`🔥 Winning margin: ${data.stats.winningMargin} pts`)
  if (data.stats.biggest) {
    lines.push(`⚡ Biggest score: +${data.stats.biggest.points} — ${data.stats.biggest.teamName} on "${data.stats.biggest.roundTitle}"`)
  }
  if (data.stats.fastestBuzz) {
    lines.push(`🔔 Fastest buzz: ${(data.stats.fastestBuzz.ms / 1000).toFixed(2)}s — ${data.stats.fastestBuzz.name} (${data.stats.fastestBuzz.teamName})`)
  }
  lines.push(`🏀 Buckets: ${data.stats.correctCount} scored${data.stats.noScoreCount > 0 ? ` · ${data.stats.noScoreCount} no-score` : ''}`)

  ctx.fillStyle = COLORS.slate
  ctx.font = '24px Inter'
  for (const line of lines) {
    ctx.fillText(truncate(ctx, line, SIZE - 140), SIZE / 2, statY)
    statY += 38
  }

  ctx.fillStyle = COLORS.slateDim
  ctx.font = '18px Inter'
  ctx.fillText(new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), SIZE / 2, SIZE - 40)
}

export async function downloadRecapCard(data: RecapCardData): Promise<void> {
  // Canvas text doesn't wait for web fonts the way DOM layout does — without this, fillText
  // can silently fall back to a system font if this is called before Bebas Neue/Inter finish
  // loading. Cheap to await unconditionally since it resolves instantly once fonts are ready.
  await document.fonts.ready

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  draw(ctx, data)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(data.gameName)}-recap.png`
  a.click()
  URL.revokeObjectURL(url)
}
