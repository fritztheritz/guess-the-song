import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { TierList } from '../types/tierlist'
import { getTierList } from '../lib/storage/tierlist-repository'
import { rankedCount, songsInGroup } from '../lib/tierlist-ranking'
import { playCorrect, playFanfare } from '../lib/sound-effects'
import { GROUP_VOTE_KEY } from '../components/TierListGroupRanking'
import SoundControl from '../components/SoundControl'
import Spinner from '../components/Spinner'
import Confetti from '../components/Confetti'
import ProgressRing from '../components/ProgressRing'
import JoinQrCode from '../components/JoinQrCode'
import { joinUrl } from '../lib/buzzer/join-url'

const TIER_STORAGE_KEY = 'gts.tierlists.v1'

interface GroupVote {
  listId: string
  code: string
  joined: number
  voted: number
}

function readGroupVote(listId: string): GroupVote | null {
  try {
    const raw = localStorage.getItem(GROUP_VOTE_KEY)
    const v = raw ? (JSON.parse(raw) as GroupVote) : null
    return v && v.listId === listId ? v : null
  } catch {
    return null
  }
}

// The read-only "big screen" for a tier list, opened in a second tab alongside the Present screen
// (same split as the draft's Presentation): the host ranks, this mirrors it large for the room. It
// re-reads storage on the cross-tab `storage` event, so no sync channel of its own is needed.
export default function TierListDisplay() {
  const { tierListId } = useParams()
  const [list, setList] = useState<TierList | null>(null)
  const [vote, setVote] = useState<GroupVote | null>(null)
  const [justPlacedId, setJustPlacedId] = useState<string | null>(null)
  const [celebrating, setCelebrating] = useState(false)
  const prevTiersRef = useRef<Map<string, string | null> | null>(null)
  const wasCompleteRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (!tierListId) return
    const load = () => {
      setList(getTierList(tierListId))
      setVote(readGroupVote(tierListId))
    }
    load()
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === TIER_STORAGE_KEY || e.key === GROUP_VOTE_KEY) load()
    }
    // Belt-and-suspenders for a missed `storage` event (e.g. the tab was asleep).
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [tierListId])

  // Flash whichever song just changed tier, and cheer when the last one is filed. The first load
  // only records the starting positions, so opening this mid-ranking doesn't "replay" anything.
  useEffect(() => {
    if (!list) return
    const current = new Map(list.songs.map((s) => [s.id, s.tierId]))
    const prev = prevTiersRef.current
    if (prev) {
      const moved = list.songs.find((s) => s.tierId !== null && prev.get(s.id) !== s.tierId)
      if (moved) {
        setJustPlacedId(moved.id)
        playCorrect()
        const t = setTimeout(() => setJustPlacedId(null), 1800)
        prevTiersRef.current = current
        return () => clearTimeout(t)
      }
    }
    prevTiersRef.current = current
  }, [list])

  const complete = !!list && list.songs.length > 0 && list.songs.every((s) => s.tierId !== null)
  useEffect(() => {
    if (wasCompleteRef.current === false && complete) {
      playFanfare()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCelebrating(true)
      const t = setTimeout(() => setCelebrating(false), 4000)
      wasCompleteRef.current = complete
      return () => clearTimeout(t)
    }
    wasCompleteRef.current = complete
  }, [complete])

  if (!list) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-slate-400">
        {tierListId && localStorage.getItem(TIER_STORAGE_KEY) === null ? 'Tier list not found.' : (
          <>
            <Spinner />
            <span>Loading…</span>
          </>
        )}
      </div>
    )
  }

  const unranked = songsInGroup(list, null)
  const ranked = rankedCount(list)
  const upNext = unranked[0]
  const topTier = list.tiers.find((t) => songsInGroup(list, t.id).length > 0)

  return (
    <div className="flex min-h-svh flex-col court-lines px-6 py-6 sm:px-10">
      {celebrating && <Confetti />}

      <div className="mb-5 flex items-center justify-between gap-4">
        <Link to={`/tierlists/${list.id}/present`} className="text-sm text-slate-500 hover:text-slate-300">
          ← Control screen
        </Link>
        <div className="flex items-center gap-4 text-center">
          <ProgressRing value={ranked} max={list.songs.length} size={64} label="songs ranked" />
          <h1 className="font-display text-4xl tracking-wide text-white">{list.name}</h1>
        </div>
        <SoundControl />
      </div>

      <div className="mb-4 flex flex-wrap items-stretch justify-center gap-4">
      {vote && (
        <div className="flex w-fit items-center gap-5 rounded-2xl border border-arena-700 bg-arena-900/60 px-6 py-4">
          <JoinQrCode code={vote.code} size={120} />
          <div className="text-left">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Rank it from your phone</div>
            <div className="font-display text-5xl tracking-[0.3em] text-white">{vote.code}</div>
            <div className="mt-1 text-sm text-slate-400">
              or go to <span className="text-slate-200">{joinUrl(vote.code).replace(/^https?:\/\//, '')}</span>
            </div>
            <div className="mt-1 text-sm text-hardwood-300">
              {vote.voted} of {vote.joined} voted
            </div>
          </div>
        </div>
      )}

      {complete ? (
        <div className="w-full text-center">
          <div className="font-display text-5xl tracking-widest text-hardwood-400">🏆 ALL RANKED</div>
          {topTier && (
            <p className="mt-1 text-xl text-slate-300">
              Top tier ({topTier.name}): {songsInGroup(list, topTier.id).map((s) => s.title).join(' · ')}
            </p>
          )}
        </div>
      ) : (
        upNext && (
          <div className="flex items-center gap-5 rounded-2xl border border-arena-600 bg-arena-800/70 p-4">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-arena-700 shadow-lg">
              {upNext.artworkUrl ? <img src={upNext.artworkUrl} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Up next · {unranked.length} to go</div>
              <div className="font-display text-4xl text-white">{upNext.title}</div>
              <div className="text-lg text-slate-400">{upNext.artist}</div>
            </div>
          </div>
        )
      )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {list.tiers.map((tier) => {
          const songs = songsInGroup(list, tier.id)
          return (
            <div key={tier.id} className="flex rounded-xl border border-arena-600">
              <div
                className="flex min-w-24 max-w-48 shrink-0 items-center justify-center break-words rounded-l-xl px-4 text-center font-display text-4xl leading-tight text-arena-950"
                style={{ background: tier.color }}
              >
                {tier.name}
              </div>
              <div className="flex min-h-20 flex-1 flex-wrap content-center items-center gap-3 rounded-r-xl bg-arena-800/60 p-3">
                {songs.map((song) => (
                  <div key={song.id} className={`w-20 rounded-lg ${justPlacedId === song.id ? 'animate-pop-in ring-4 ring-hardwood-400' : ''}`}>
                    <div className="h-20 w-20 overflow-hidden rounded-lg border border-arena-600 bg-arena-700">
                      {song.artworkUrl ? (
                        <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl text-arena-500">♪</div>
                      )}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs font-medium leading-tight text-slate-100">{song.title}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
