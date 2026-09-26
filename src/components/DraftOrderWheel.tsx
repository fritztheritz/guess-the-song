import { useEffect, useRef, useState } from 'react'

interface WheelEntry {
  index: number
  name: string
  color: string
  avatar?: string
}

const WHEEL_SIZE = 280
const RADIUS = WHEEL_SIZE / 2
const SPIN_DURATION_MS = 3200

/** Returns the CSS rotation (in degrees) to animate the wheel TO, starting from `currentRotation`,
 *  so that once it stops, the fixed pointer at the top (12 o'clock, i.e. the 0deg mark) is pointing
 *  into the middle of the `winnerIndex`-th slice. Slices are equal, `segmentCount` of them, drawn
 *  starting at 0deg and going clockwise (see `draw()` below — slice i spans
 *  [i * 360/segmentCount, (i+1) * 360/segmentCount)).
 *
 *  Must also throw in a few extra full rotations so the animation actually looks like a spin, and
 *  the returned value must always be greater than `currentRotation` (a CSS transition animates
 *  forward from the current transform to the new one — if the target is smaller, or equal, the
 *  wheel will visibly snap backward or not move at all instead of spinning forward).
 */
function computeSpinTargetRotation(currentRotation: number, segmentCount: number, winnerIndex: number, extraSpins = 6): number {
  const sliceAngle = 360 / segmentCount
  const targetLocalAngle = winnerIndex * sliceAngle + sliceAngle / 2
  // The wheel is never reset to 0deg between spins (currentRotation carries over, mod 360), so the
  // winner's local slice angle has to be aligned against wherever the wheel is CURRENTLY sitting,
  // not against a fresh 0deg baseline.
  const deltaToAlign = (360 - ((targetLocalAngle + currentRotation) % 360)) % 360
  return currentRotation + extraSpins * 360 + deltaToAlign
}

export default function DraftOrderWheel({
  entries,
  onComplete,
  onClose,
}: {
  entries: { name: string; color: string; avatar?: string }[]
  onComplete: (orderedIndices: number[]) => void
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [remaining, setRemaining] = useState<WheelEntry[]>(entries.map((e, index) => ({ index, ...e })))
  const [order, setOrder] = useState<WheelEntry[]>([])
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining])

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE)
    const n = remaining.length
    if (n === 0) return
    const sliceAngle = (2 * Math.PI) / n
    remaining.forEach((entry, i) => {
      const start = i * sliceAngle - Math.PI / 2
      const end = start + sliceAngle
      ctx.beginPath()
      ctx.moveTo(RADIUS, RADIUS)
      ctx.arc(RADIUS, RADIUS, RADIUS - 4, start, end)
      ctx.closePath()
      ctx.fillStyle = entry.color
      ctx.fill()
      ctx.save()
      ctx.translate(RADIUS, RADIUS)
      ctx.rotate(start + sliceAngle / 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#0b0f14'
      ctx.font = '600 13px Inter, sans-serif'
      ctx.fillText(entry.name.slice(0, 14), RADIUS - 14, 4)
      ctx.restore()
    })
  }

  function spin() {
    if (spinning || remaining.length === 0) return
    setSpinning(true)
    const winnerIndex = Math.floor(Math.random() * remaining.length)
    const target = computeSpinTargetRotation(rotation, remaining.length, winnerIndex)
    setRotation(target)
    window.setTimeout(() => {
      const winner = remaining[winnerIndex]
      const nextRemaining = remaining.filter((_, i) => i !== winnerIndex)
      const nextOrder = [...order, winner]
      setOrder(nextOrder)
      setRemaining(nextRemaining)
      setSpinning(false)
      setRotation((r) => r % 360)
      if (nextRemaining.length === 0) {
        onComplete(nextOrder.map((e) => e.index))
      }
    }, SPIN_DURATION_MS)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-arena-600 bg-arena-900 p-6 text-center shadow-2xl">
        <div className="mb-1 font-display text-xl tracking-wide text-hardwood-400">SPIN FOR ORDER</div>
        <p className="mb-4 text-sm text-slate-400">
          {remaining.length > 0 ? `Pick #${order.length + 1} of ${entries.length}` : 'Order set!'}
        </p>

        <div className="relative mx-auto" style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}>
          <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1 text-2xl">🔻</div>
          <canvas
            ref={canvasRef}
            width={WHEEL_SIZE}
            height={WHEEL_SIZE}
            className="rounded-full border-4 border-arena-600"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.15, 0.6, 0.2, 1)` : 'none',
            }}
          />
        </div>

        {order.length > 0 && (
          <div className="mt-4 space-y-1 text-left text-sm text-slate-300">
            {order.map((e, i) => (
              <div key={e.index} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-slate-500">#{i + 1}</span>
                <span style={{ color: e.color }}>
                  {e.avatar ? `${e.avatar} ` : ''}
                  {e.name}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-arena-500 py-2 text-sm text-slate-300 hover:border-hardwood-500">
            Cancel
          </button>
          {remaining.length > 0 && (
            <button
              onClick={spin}
              disabled={spinning}
              className="flex-[2] rounded-full bg-hardwood-500 py-2 font-semibold text-arena-950 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-hardwood-400"
            >
              {spinning ? 'SPINNING…' : order.length === 0 ? '🎡 SPIN' : '🎡 SPIN NEXT'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
