import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function joinUrl(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}buzz/${code}`
}

// Renders nothing on failure (e.g. QRCode throwing on a malformed URL) — the room code text
// shown alongside this everywhere it's used is always sufficient on its own, so a missing
// QR image is a silent degrade, not something worth a fallback UI for.
export default function JoinQrCode({ code, size = 160 }: { code: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(joinUrl(code), { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [code, size])

  if (!dataUrl) return null
  return <img src={dataUrl} alt={`Scan to join room ${code}`} className="rounded-lg bg-white p-2" style={{ width: size, height: size }} />
}
