// Cover art that fills its box, with a styled placeholder when a round has none — so the
// clue screen never shows a bare dark square.
export default function ArtworkFill({ url }: { url?: string }) {
  if (url) return <img src={url} alt="" className="h-full w-full object-cover" />
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-hardwood-500/30 via-arena-800 to-arena-700 text-5xl" aria-hidden>
      🎵
    </div>
  )
}
