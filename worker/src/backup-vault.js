// Cloud backup: stores one device's full-library backup (the same JSON file as "Export everything")
// under a long random code that only the owner knows. Whoever holds the code can read and replace it
// — there are no accounts — so the code is generated client-side with ~80 bits of randomness and is
// never listed or searchable. A backup that isn't touched for 90 days is deleted.

const MAX_BYTES = 1_500_000 // ~1.5 MB — a big library is a few hundred KB
const CHUNK = 100_000
const TTL_MS = 90 * 24 * 60 * 60 * 1000

export class BackupVault {
  constructor(state) {
    this.state = state
  }

  async fetch(request) {
    if (request.method === 'GET') return this.read()
    if (request.method === 'PUT') return this.write(request)
    return new Response('Method not allowed', { status: 405 })
  }

  async read() {
    const meta = await this.state.storage.get('meta')
    if (!meta) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    const parts = []
    for (let i = 0; i < meta.chunks; i++) parts.push((await this.state.storage.get(`c${i}`)) ?? '')
    return new Response(JSON.stringify({ updatedAt: meta.updatedAt, backup: parts.join('') }), { headers: { 'Content-Type': 'application/json' } })
  }

  async write(request) {
    const text = await request.text()
    if (text.length > MAX_BYTES) return new Response(JSON.stringify({ error: 'too_large' }), { status: 413, headers: { 'Content-Type': 'application/json' } })
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    // Only store something that looks like our own backup file — this isn't a general file drop.
    if (!parsed || parsed.format !== 'guess-the-song-backup') {
      return new Response(JSON.stringify({ error: 'not_a_backup' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const old = await this.state.storage.get('meta')
    const chunks = Math.max(1, Math.ceil(text.length / CHUNK))
    for (let i = 0; i < chunks; i++) await this.state.storage.put(`c${i}`, text.slice(i * CHUNK, (i + 1) * CHUNK))
    // A shorter backup than last time leaves stale trailing chunks — drop them.
    if (old) for (let i = chunks; i < old.chunks; i++) await this.state.storage.delete(`c${i}`)
    const updatedAt = new Date().toISOString()
    await this.state.storage.put('meta', { chunks, updatedAt })
    await this.state.storage.setAlarm(Date.now() + TTL_MS)
    return new Response(JSON.stringify({ updatedAt }), { headers: { 'Content-Type': 'application/json' } })
  }

  // Untouched for the whole retention period: forget it.
  async alarm() {
    await this.state.storage.deleteAll()
  }
}
