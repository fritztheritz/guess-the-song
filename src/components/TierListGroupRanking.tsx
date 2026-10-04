import { useEffect, useMemo, useRef, useState } from 'react'
import type { TierList } from '../types/tierlist'
import { BuzzerSocket, type SocketStatus } from '../lib/buzzer/buzzer-socket'
import { generateRoomCode } from '../lib/buzzer/config'
import type { BuzzerPlayer, PhoneRoundState } from '../lib/buzzer/protocol'
import { applyConsensus, decodeTierBallot, groupConsensus } from '../lib/tierlist-ballot'
import ConnectionBanner from './ConnectionBanner'
import JoinLink from './JoinLink'
import JoinQrCode from './JoinQrCode'
import Button from './ui/Button'
import Panel from './ui/Panel'

interface Vote {
  name: string
  tiers: number[]
}

const VOTER_TEAM_ID = 'voters'

/** Mirrored to localStorage so the big-screen Display tab can show the join code while voting runs. */
export const GROUP_VOTE_KEY = 'gts.tierlist.groupvote.v1'

// Phone voting for a tier list: everyone joins one room, files every song into a tier on their own
// phone, and the host sees the group's average. Applying it fills in the host's tier list (which can
// be undone like any other move). The songs and tiers phones vote on are frozen when voting starts,
// so a ballot always lines up with what the voter saw.
export default function TierListGroupRanking({ list, onApply }: { list: TierList; onApply: (next: TierList) => void }) {
  const [code, setCode] = useState<string | null>(null)
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const [players, setPlayers] = useState<BuzzerPlayer[]>([])
  const [votes, setVotes] = useState<Record<string, Vote>>({})
  const [expanded, setExpanded] = useState(true)
  const socketRef = useRef<BuzzerSocket | null>(null)
  // What phones were shown: set once per voting round, so ballots always decode against it.
  const [frozen, setFrozen] = useState<{ songs: TierList['songs']; tiers: TierList['tiers'] } | null>(null)
  const playersRef = useRef<BuzzerPlayer[]>([])

  function start() {
    setFrozen({
      songs: list.songs.map((s) => ({ ...s })),
      tiers: list.tiers.map((t) => ({ ...t })),
    })
    setVotes({})
    setExpanded(true)
    setCode(generateRoomCode())
  }

  function stop() {
    setCode(null)
  }

  const voterNames = useMemo(() => new Map(players.map((p) => [p.connId, p.name])), [players])

  useEffect(() => {
    if (!code || !frozen) return
    const socket = new BuzzerSocket(code, 'host')
    socketRef.current = socket
    const offStatus = socket.onStatus(setStatus)
    const off = socket.onMessage((msg) => {
      if (msg.type === 'roster') {
        playersRef.current = msg.players
        setPlayers(msg.players)
      } else if (msg.type === 'ballot') {
        const tiers = decodeTierBallot(msg.rankedTeamIds, frozen.songs.length, frozen.tiers.length)
        if (!tiers) return
        const name = playersRef.current.find((p) => p.connId === msg.connId)?.name ?? 'Someone'
        // One ballot per phone — a repeat from the same connection is ignored.
        setVotes((prev) => (prev[msg.connId] ? prev : { ...prev, [msg.connId]: { name, tiers } }))
      }
    })
    socket.connect()
    return () => {
      // Tell phones voting is over before hanging up.
      socket.send({
        type: 'sync-round',
        state: { gameName: '', possessionIndex: 0, totalPossessions: 0, phase: 'final', mode: 'tierlist', clueText: null, revealed: null, teams: [] },
      })
      off()
      offStatus()
      socket.close()
      socketRef.current = null
      setStatus('connecting')
      setPlayers([])
    }
  }, [code, frozen])

  // Keep the room's single voter "team", and the phone-safe ballot state, current — re-sent on
  // reconnect and whenever someone submits.
  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !code || !frozen) return
    socket.sendAndRemember({ type: 'sync-teams', teams: [{ id: VOTER_TEAM_ID, name: 'Voters', color: '#e8871e', avatar: '🗳️' }] })
    const state: PhoneRoundState = {
      gameName: list.name,
      possessionIndex: 0,
      totalPossessions: 0,
      phase: 'ranking',
      mode: 'tierlist',
      clueText: null,
      revealed: null,
      teams: [],
      tierlist: {
        songs: frozen.songs.map((s) => ({ id: s.id, title: s.title, artist: s.artist, artworkUrl: s.artworkUrl, url: s.soundcloudUrl })),
        tiers: frozen.tiers.map((t) => ({ name: t.name, color: t.color })),
        submitted: Object.keys(votes),
      },
    }
    socket.sendAndRemember({ type: 'sync-round', state })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, frozen, status, votes])

  const ballots = Object.values(votes)

  useEffect(() => {
    try {
      if (code) localStorage.setItem(GROUP_VOTE_KEY, JSON.stringify({ listId: list.id, code, joined: players.length, voted: Object.keys(votes).length }))
      else localStorage.removeItem(GROUP_VOTE_KEY)
    } catch {
      // Best-effort only.
    }
  }, [code, list.id, players.length, votes])
  useEffect(
    () => () => {
      try {
        localStorage.removeItem(GROUP_VOTE_KEY)
      } catch {
        // Best-effort only.
      }
    },
    [],
  )
  const consensus = useMemo(
    () => (frozen ? groupConsensus(frozen.songs.map((s) => s.id), ballots.map((v) => v.tiers)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [votes, frozen],
  )

  if (!code) {
    return (
      <Panel padding="md" className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-100">📱 Group ranking</div>
          <p className="text-sm text-slate-400">Everyone ranks the list on their own phone, then you see where the group put each song.</p>
        </div>
        <Button size="sm" onClick={start} disabled={list.songs.length === 0}>
          Start group ranking
        </Button>
      </Panel>
    )
  }

  return (
    <Panel padding="md" className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm text-slate-200">
          <span className="font-semibold">📱 Group ranking</span> · <span className="font-display tracking-[0.2em] text-white">{code}</span> ·{' '}
          <span className="text-slate-400">
            {ballots.length} of {Math.max(players.length, ballots.length)} voted
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!expanded && ballots.length > 0 && frozen && (
            <Button size="sm" onClick={() => onApply(applyConsensus(list, consensus))}>
              Use group ranking
            </Button>
          )}
          <button onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-xs text-slate-400 underline hover:text-slate-200">
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          <button onClick={stop} className="text-xs text-slate-500 underline hover:text-slate-300">
            Stop
          </button>
        </div>
      </div>
      {expanded && (
      <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <JoinQrCode code={code} size={112} />
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Scan or enter the code</div>
            <div className="font-display text-3xl tracking-[0.3em] text-white">{code}</div>
            <p className="mt-1 max-w-xs text-xs text-slate-400">Pick a name, then tap a tier for every song. Phones vote on the songs and tiers as they are right now.</p>
          </div>
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] uppercase tracking-widest text-slate-500">On a computer? Use this link</div>
        <JoinLink code={code} />
      </div>
      <ConnectionBanner status={status} />

      <div className="flex flex-wrap gap-1.5" aria-label="Voting status">
        {players.length === 0 && <span className="text-xs text-slate-500">Nobody has joined yet.</span>}
        {players.map((p) => (
          <span
            key={p.connId}
            className={`rounded-full px-3 py-1 text-xs ${votes[p.connId] ? 'bg-scoreboard-green/15 text-scoreboard-green' : 'bg-hardwood-500/20 text-hardwood-300'}`}
          >
            {votes[p.connId] ? '✓ ' : '📱 '}
            {voterNames.get(p.connId)}
          </span>
        ))}
        {Object.entries(votes)
          .filter(([id]) => !voterNames.has(id))
          .map(([id, v]) => (
            <span key={id} className="rounded-full bg-scoreboard-green/15 px-3 py-1 text-xs text-scoreboard-green">
              ✓ {v.name}
            </span>
          ))}
      </div>

      {frozen && ballots.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-100">
              Group result · {ballots.length} ballot{ballots.length === 1 ? '' : 's'}
            </div>
            <Button size="sm" onClick={() => onApply(applyConsensus(list, consensus))}>
              Use group ranking
            </Button>
          </div>
          <div className="space-y-1.5">
            {frozen.tiers.map((tier, t) => {
              const rows = consensus
                .filter((c) => c.tierIndex === t)
                .sort((a, b) => a.mean! - b.mean!)
                .map((c) => ({ c, song: frozen.songs.find((s) => s.id === c.songId)! }))
              if (rows.length === 0) return null
              return (
                <div key={tier.id} className="flex items-start gap-2 text-sm">
                  <span className="w-14 shrink-0 rounded-md px-2 py-0.5 text-center text-xs font-bold text-arena-950" style={{ background: tier.color }}>
                    {tier.name}
                  </span>
                  <span className="text-slate-300">
                    {rows.map(({ c, song }, i) => (
                      <span key={song.id}>
                        {i > 0 && <span className="text-slate-600"> · </span>}
                        {song.title}
                        <span className="text-xs text-slate-500"> ({(c.mean! + 1).toFixed(1)})</span>
                      </span>
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">The number is the average tier (1 = top). Songs land in the tier closest to their average.</p>
        </div>
      )}
      </>
      )}
    </Panel>
  )
}
