import { useEffect, useRef, useState } from 'react'
import { getTrackPlayback } from './soundcloud-playback'

export interface PreviewableTrack {
  /** Identity this track is tracked/highlighted by — the caller's own id for it. */
  key: string
  soundcloudTrackId: string
  soundcloudSecretToken?: string
}

/** Shared play/pause-one-at-a-time preview player for SoundCloud tracks, backed by this app's
 *  own authenticated connection (works for private tracks, unlike SoundCloud's public embed
 *  widget, which can't play private content at all — confirmed directly against SoundCloud).
 *  Used both for quick single-track previews (ImportSoundCloudModal, which lets `queue` default
 *  to just the one track) and for auto-advancing through a roster (DraftSessionRoom's Listening
 *  Time screen, which passes the full roster as `queue`). */
export function useSoundCloudPreview(onError: (err: unknown) => void) {
  const [previewingKey, setPreviewingKey] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    audioRef.current = new Audio()
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  async function playAt(queue: PreviewableTrack[], index: number) {
    const audio = audioRef.current
    const track = queue[index]
    if (!audio || !track) return
    try {
      const url = await getTrackPlayback(track.soundcloudTrackId, track.soundcloudSecretToken)
      audio.src = url
      audio.currentTime = 0
      await audio.play()
      setPreviewingKey(track.key)
      audio.onended = () => {
        const next = index + 1
        if (next < queue.length && queue[next].soundcloudTrackId) {
          playAt(queue, next)
        } else {
          setPreviewingKey(null)
        }
      }
    } catch (err) {
      onError(err)
      setPreviewingKey(null)
    }
  }

  function toggle(track: PreviewableTrack, queue: PreviewableTrack[] = [track]) {
    const audio = audioRef.current
    if (!audio) return
    if (previewingKey === track.key) {
      audio.pause()
      setPreviewingKey(null)
      return
    }
    const index = queue.findIndex((t) => t.key === track.key)
    if (index === -1) return
    playAt(queue, index)
  }

  return { previewingKey, toggle }
}
