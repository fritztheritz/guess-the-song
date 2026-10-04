// The big countdown number — amber normally, red and pulsing for the last 5 seconds so the
// room can feel time running out.
export default function ShotClockDigit({ seconds }: { seconds: number }) {
  const shown = Math.ceil(seconds)
  const urgent = shown > 0 && shown <= 5
  return (
    <div
      className={`scoreboard-digit font-display text-7xl ${urgent ? 'animate-pulse text-scoreboard-500' : 'text-scoreboard-amber'}`}
      role="timer"
      aria-label={`${shown} seconds left`}
    >
      {shown}
    </div>
  )
}
