// A finished Blind Ranking as a shareable PNG. Drawn on a canvas like tierlist-image.ts and text-only for
// the same reason: SoundCloud artwork is cross-origin and would taint the canvas.

const W = 1080
const PAD = 60
const ROW = 64

export async function downloadRankingImage(listName: string, ranked: Array<{ title: string; artist: string }>): Promise<void> {
  await document.fonts.ready
  const height = 190 + ranked.length * ROW + 70
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const bg = ctx.createLinearGradient(0, 0, 0, height)
  bg.addColorStop(0, '#0a1128')
  bg.addColorStop(1, '#050a1c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, height)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#f8fafc'
  ctx.font = '56px "Bebas Neue"'
  ctx.fillText(listName.toUpperCase(), W / 2, 90, W - PAD * 2)
  ctx.fillStyle = '#ff6a13'
  ctx.font = '20px Inter'
  ctx.fillText('BLIND RANKING', W / 2, 125)

  const medals = ['#facc15', '#cbd5e1', '#d97706']
  ranked.forEach((song, i) => {
    const y = 170 + i * ROW
    ctx.fillStyle = '#0f1938'
    ctx.fillRect(PAD, y, W - PAD * 2, ROW - 8)
    ctx.fillStyle = medals[i] ?? '#ff6a13'
    ctx.font = '40px "Bebas Neue"'
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), PAD + 36, y + 40)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#f1f5f9'
    ctx.font = '26px Inter'
    ctx.fillText(song.title, PAD + 80, y + 28, W - PAD * 2 - 100)
    ctx.fillStyle = '#64748b'
    ctx.font = '17px Inter'
    ctx.fillText(song.artist, PAD + 80, y + 48, W - PAD * 2 - 100)
  })

  ctx.textAlign = 'center'
  ctx.fillStyle = '#64748b'
  ctx.font = '18px Inter'
  ctx.fillText(new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), W / 2, height - 26)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${listName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ranking'}-blind-ranking.png`
  a.click()
  URL.revokeObjectURL(url)
}
