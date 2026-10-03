/** ▲/▼ with how many places a team has climbed (+) or dropped (−); nothing when unchanged. */
export default function MoveTag({ move }: { move: number }) {
  if (!move) return null
  return (
    <span className={`ml-1 text-xs font-bold ${move > 0 ? 'text-scoreboard-green' : 'text-scoreboard-500'}`} title={move > 0 ? `Up ${move}` : `Down ${-move}`}>
      {move > 0 ? '▲' : '▼'}
      {Math.abs(move)}
    </span>
  )
}
