import { useParams, useSearchParams } from 'react-router-dom'
import HostController from './HostController'
import PublicDisplay from './PublicDisplay'

// Splits into two very different components rather than branching one component on a
// boolean — PublicDisplay must never call a hook that could mutate game state or touch
// audio, and keeping them as separate components (instead of `if` branches sharing hooks)
// makes that a structural guarantee, not just a convention to remember.
export default function Presentation() {
  const { gameId } = useParams()
  const [searchParams] = useSearchParams()

  if (!gameId) {
    return <div className="flex min-h-svh items-center justify-center bg-arena-950 text-slate-400">Game not found.</div>
  }

  return searchParams.get('display') === 'public' ? <PublicDisplay gameId={gameId} /> : <HostController gameId={gameId} />
}
