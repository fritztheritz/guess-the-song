// Synthesized via Web Audio API rather than a bundled audio file — no asset/licensing
// to manage, and it's a couple lines of oscillator scheduling either way.
let sharedContext: AudioContext | null = null

function getContext(): AudioContext {
  if (!sharedContext) sharedContext = new AudioContext()
  if (sharedContext.state === 'suspended') void sharedContext.resume()
  return sharedContext
}

const MUTE_STORAGE_KEY = 'gts.sound-muted'

function readStoredMute(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// Per-browser, not per-game — a host running several games in one sitting shouldn't have
// to re-mute for each one.
let muted = readStoredMute()

export function isSoundMuted(): boolean {
  return muted
}

export function setSoundMuted(next: boolean) {
  muted = next
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0')
  } catch {
    // localStorage unavailable — mute still applies for this tab, it just won't persist.
  }
}

/** A short two-tone arena buzzer, for the Buzzer Beater reveal. Call from a user-gesture handler. */
export function playBuzzer() {
  if (muted) return
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

/** A quick double-blip for the moment a player actually buzzes in — distinct from and
 * earlier than playBuzzer()'s reveal cue. Short and sharp, game-show style. */
export function playBuzzIn() {
  if (muted) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    ;[0, 0.09].forEach((offset) => {
      const start = now + offset
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.08)
      gain.connect(ctx.destination)

      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.setValueAtTime(660, start)
      osc.connect(gain)
      osc.start(start)
      osc.stop(start + 0.08)
    })
  } catch {
    // Best-effort, same as playBuzzer().
  }
}

/** A bright ascending chime for a confirmed-correct answer. */
export function playCorrect() {
  if (muted) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    ;[523.25, 659.25].forEach((freq, i) => {
      const start = now + i * 0.09
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.28, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25)
      gain.connect(ctx.destination)

      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)
      osc.connect(gain)
      osc.start(start)
      osc.stop(start + 0.25)
    })
  } catch {
    // Best-effort, same as playBuzzer().
  }
}

/** A triumphant rising arpeggio for the final-score/winner reveal. */
export function playFanfare() {
  if (muted) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const start = now + i * 0.12
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6)
      gain.connect(ctx.destination)

      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)
      osc.connect(gain)
      osc.start(start)
      osc.stop(start + 0.6)
    })
  } catch {
    // Best-effort, same as playBuzzer().
  }
}

/** A short flat "womp" for a wrong buzz-in — lighter than playBuzzer() since it's just
 * "try again" feedback, not the big reveal moment. */
export function playWrong() {
  if (muted) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)
    gain.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(180, now)
    osc.frequency.linearRampToValueAtTime(110, now + 0.28)
    osc.connect(gain)
    osc.start(now)
    osc.stop(now + 0.3)
  } catch {
    // Best-effort, same as playBuzzer().
  }
}
