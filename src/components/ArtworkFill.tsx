import ArtPlaceholder from './ArtPlaceholder'

// Cover art that fills its box, with a generated cover when a round has none — so the clue screen
// never shows a bare dark square.
export default function ArtworkFill({ url, seed = '' }: { url?: string; seed?: string }) {
  if (url) return <img src={url} alt="" className="h-full w-full object-cover" />
  return <ArtPlaceholder seed={seed} />
}
