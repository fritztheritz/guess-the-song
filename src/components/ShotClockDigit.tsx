import SegDigits from './SegDigits'

// The big countdown number — amber normally, red and pulsing for the last 5 seconds so the
// room can feel time running out. A seven-segment readout, like the arena's shot clock.
export default function ShotClockDigit({ seconds }: { seconds: number }) {
  const shown = Math.ceil(seconds)
  const urgent = shown > 0 && shown <= 5
  return (
    <div
      className={`inline-block rounded-sm bg-black/50 px-3 py-2 shadow-[inset_0_2px_8px_rgb(0_0_0/0.7)] ${urgent ? 'animate-pulse text-scoreboard-500' : 'text-scoreboard-amber'}`}
      role="timer"
      aria-label={`${shown} seconds left`}
    >
      <SegDigits value={shown} cells={2} className="text-6xl" />
    </div>
  )
}
