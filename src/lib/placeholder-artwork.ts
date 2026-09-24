// Generates a text-card placeholder (white background, bold black text, centered,
// word-wrapped) for SoundCloud tracks that don't have their own artwork, so tier list
// tiles always show something legible instead of a blank square. Rendered client-side
// with Canvas — no backend/image service needed on a static site.
const CANVAS_SIZE = 500
const MAX_FONT = 84
const MIN_FONT = 28
const PADDING = 60

function wrapWords(ctx: CanvasRenderingContext2D, words: string[], maxWidth: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

export function generatePlaceholderArtwork(text: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  ctx.fillStyle = '#0a0a0a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const words = text.trim().split(/\s+/).filter(Boolean)
  const maxWidth = CANVAS_SIZE - PADDING * 2
  const maxHeight = CANVAS_SIZE - PADDING * 2

  let fontSize = MAX_FONT
  let lines: string[] = [text]
  while (fontSize >= MIN_FONT) {
    ctx.font = `800 ${fontSize}px "Helvetica Neue", Arial, sans-serif`
    lines = wrapWords(ctx, words, maxWidth)
    const lineHeight = fontSize * 1.2
    if (lines.length <= 5 && lines.length * lineHeight <= maxHeight) break
    fontSize -= 4
  }

  const lineHeight = fontSize * 1.2
  const startY = CANVAS_SIZE / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, i) => ctx.fillText(line, CANVAS_SIZE / 2, startY + i * lineHeight))

  return canvas.toDataURL('image/png')
}
