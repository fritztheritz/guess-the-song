import { useSoundCloud } from '../state/SoundCloudContext'

export default function SoundCloudConnectPanel() {
  const { connection, isConfigured, connect, disconnect } = useSoundCloud()

  if (!isConfigured) {
    return (
      <div className="rounded-xl border border-scoreboard-amber/40 bg-scoreboard-amber/10 p-4 text-sm text-scoreboard-amber">
        SoundCloud isn't configured yet. Set <code className="rounded bg-black/30 px-1">VITE_SOUNDCLOUD_CLIENT_ID</code>,{' '}
        <code className="rounded bg-black/30 px-1">VITE_SOUNDCLOUD_REDIRECT_URI</code>, and{' '}
        <code className="rounded bg-black/30 px-1">VITE_SOUNDCLOUD_TOKEN_PROXY_URL</code> in <code>.env</code> — see
        README.md.
      </div>
    )
  }

  if (!connection) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-arena-500 bg-arena-800/60 p-8 text-center">
        <p className="text-slate-300">Connect your SoundCloud account to browse and import tracks.</p>
        <button
          onClick={connect}
          className="rounded-full bg-hardwood-500 px-6 py-2.5 font-semibold text-arena-950 shadow-lg shadow-hardwood-500/20 hover:bg-hardwood-400"
        >
          Connect SoundCloud
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-arena-600 bg-arena-800/60 p-3">
      <div className="flex items-center gap-3">
        {connection.avatarUrl ? (
          <img src={connection.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-arena-600 text-slate-300">♪</div>
        )}
        <div>
          <div className="font-medium text-slate-100">{connection.username}</div>
          <div className="text-xs text-teal-400">Connected ✓</div>
        </div>
      </div>
      <button onClick={disconnect} className="rounded-lg border border-arena-500 px-3 py-1.5 text-sm text-slate-300 hover:border-scoreboard-500 hover:text-scoreboard-500">
        Disconnect
      </button>
    </div>
  )
}
