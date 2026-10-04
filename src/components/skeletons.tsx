// Loading placeholders shaped like the real content that's about to replace them, for the
// genuinely-network-bound loads (Spotify/SoundCloud search, artist lookup) — as opposed to
// a bare spinner, which gives no sense of what's coming or how much of it. Page loads that
// just read localStorage (see useStoredEntity) are effectively instant and don't need this;
// this is for the handful of places actually waiting on a network round trip.

/** One pulsing block. The shared primitive the grid skeletons below are built from — reach
 *  for this directly for a one-off shape that doesn't warrant its own component. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-arena-700 ${className}`} />
}

/** Mirrors the track-card grid both import modals render results into (square artwork,
 *  title line, artist line) — same `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` the real
 *  grid uses, so the swap-in doesn't reflow. */
export function SkeletonTrackGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-arena-600 bg-arena-800">
          <div className="aspect-square w-full animate-pulse bg-arena-700" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Mirrors the circular-avatar artist grid (Guess the Popularity's artist search, the
 *  import modal's artist-match chip) — `grid-cols-2 sm:grid-cols-3`. */
export function SkeletonArtistGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-2 rounded-xl border border-arena-600 bg-arena-800 p-4">
          <div className="h-16 w-16 animate-pulse rounded-full bg-arena-700" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      ))}
    </div>
  )
}

/** Mirrors a single filter/search-result row (small square artwork, title + subtitle) —
 *  Guess the Timeline's song picker and similar vertical lists. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-arena-600 bg-arena-800 px-3 py-2">
      <div className="h-9 w-9 shrink-0 animate-pulse rounded bg-arena-700" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  )
}

export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}

/** A whole-page placeholder (header bar + a few content blocks) shown while a page's code loads. */
export function PageSkeleton() {
  return (
    <div className="min-h-svh court-lines" role="status" aria-label="Loading page">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-16">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-arena-600 bg-arena-800/60 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
