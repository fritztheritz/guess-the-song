// SoundCloud's developer terms require attribution for apps built on custom-player
// streaming (spec §28). Kept as a real UI element, not a footnote.
export default function SoundCloudAttribution({ className = '' }: { className?: string }) {
  return (
    <a
      href="https://soundcloud.com"
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-hardwood-400 transition-colors ${className}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M1.5 14.5v3.7l.5.3.5-.3v-3.7l-.5-.5zM3.3 12.9v6.1l.5.4.5-.4v-6.1l-.5-.6zM5.1 11.8v7.6l.5.4.5-.4v-7.6l-.5-.7zM6.9 12.2v6.9l.5.5.5-.5v-6.9l-.5-.4zM8.8 8.7v10.5l.5.6.5-.6V8.7l-.5-1zM10.7 6.9v12.5l.5.7.5-.7V6.9l-.5-1.4zM12.7 6.4v13.1l.5.7.5-.7V7.1c1-.5 2.1-.8 3.3-.8 4 0 7.3 3.1 7.6 7 0 .1 0 .3 0 .4a3.9 3.9 0 0 1-3.9 3.9H13.7v-.1l-.5-.7V6.4z" />
      </svg>
      Powered by SoundCloud
    </a>
  )
}
