// Synthesized via Web Audio API rather than a bundled audio file — no asset/licensing
// to manage, and it's a couple lines of oscillator scheduling either way.
let sharedContext: AudioContext | null = null

function getContext(): AudioContext {
  if (!sharedContext) sharedContext = new AudioContext()
  if (sharedContext.state === 'suspended') void sharedContext.resume()
  return sharedContext
}

/** A short two-tone arena buzzer, for the Buzzer Beater reveal. Call from a user-gesture handler. */
export function playBuzzer() {
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55)
    gain.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.linearRampToValueAtTime(110, now + 0.5)
    osc.connect(gain)
    osc.start(now)
    osc.stop(now + 0.55)
  } catch {
    // Web Audio can fail to init in some environments (e.g. no user gesture yet) —
    // the reveal itself isn't worth blocking on a sound effect.
  }
}
