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

const VOLUME_STORAGE_KEY = 'gts.sound-volume'

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY)
    if (raw === null) return 100
    const n = Number(raw)
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 100
  } catch {
    return 100
  }
}

// 0-100, separate from `muted` — mirrors a real volume knob: dragging it down to 0 and
// toggling mute both silence playback, but they don't clobber each other's state, so
// unmuting always comes back at whatever level the slider was last left on.
let volume = readStoredVolume()

export function getSoundVolume(): number {
  return volume
}

export function setSoundVolume(next: number) {
  volume = Math.min(100, Math.max(0, Math.round(next)))
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(volume))
  } catch {
    // localStorage unavailable — same as setSoundMuted, applies for this tab only.
  }
}

// True when nothing should play — muted, or the slider's all the way down. Volume 0 is
// folded into the same "don't even try" path as `muted` rather than scaling a gain node
// down to exactly zero, which Web Audio's exponential ramps below don't allow (they ramp
// toward 0.0001, never 0).
function silent(): boolean {
  return muted || volume <= 0
}

// Scales a sound's peak gain by the volume slider. Only ever called after a `silent()`
// guard already returned early, so `volume` here is always > 0.
function scaled(peak: number): number {
  return peak * (volume / 100)
}

/** Creates/resumes the shared audio context. Phones (iOS especially) only let audio start from a
 *  tap, so call this from a tap handler early — then cues that fire later, off a socket message
 *  rather than a tap, can still make sound. */
export function unlockAudio() {
  try {
    void getContext().resume()
  } catch {
    // No Web Audio here — sounds just won't play.
  }
}

/** A short two-tone arena buzzer, for the Buzzer Beater reveal. Call from a user-gesture handler. */
export function playBuzzer() {
  if (silent()) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(scaled(0.25), now + 0.02)
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
  if (silent()) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    ;[0, 0.09].forEach((offset) => {
      const start = now + offset
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(scaled(0.3), start + 0.015)
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
  if (silent()) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    ;[523.25, 659.25].forEach((freq, i) => {
      const start = now + i * 0.09
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(scaled(0.28), start + 0.02)
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
  if (silent()) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const start = now + i * 0.12
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(scaled(0.3), start + 0.02)
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
  if (silent()) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(scaled(0.22), now + 0.02)
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

/** A referee whistle followed by a sad descending "wah-wah" — the host ejecting a team for a laugh. */
export function playEject() {
  if (silent()) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    const whistleGain = ctx.createGain()
    whistleGain.gain.setValueAtTime(0.0001, now)
    whistleGain.gain.exponentialRampToValueAtTime(scaled(0.18), now + 0.02)
    whistleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
    whistleGain.connect(ctx.destination)

    const whistle = ctx.createOscillator()
    whistle.type = 'sine'
    whistle.frequency.setValueAtTime(2600, now)
    const vibrato = ctx.createOscillator()
    const vibratoDepth = ctx.createGain()
    vibrato.frequency.value = 28
    vibratoDepth.gain.value = 140
    vibrato.connect(vibratoDepth)
    vibratoDepth.connect(whistle.frequency)
    whistle.connect(whistleGain)
    whistle.start(now)
    vibrato.start(now)
    whistle.stop(now + 0.45)
    vibrato.stop(now + 0.45)

    const notes = [330, 311, 294, 262]
    notes.forEach((freq, i) => {
      const start = now + 0.5 + i * 0.22
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(scaled(0.2), start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (i === notes.length - 1 ? 0.7 : 0.2))
      gain.connect(ctx.destination)
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(freq, start)
      if (i === notes.length - 1) osc.frequency.linearRampToValueAtTime(freq * 0.8, start + 0.7)
      osc.connect(gain)
      osc.start(start)
      osc.stop(start + (i === notes.length - 1 ? 0.7 : 0.2))
    })
  } catch {
    // Best-effort, same as playBuzzer().
  }
}

/** One short, quiet click — the per-second countdown cue for a turn timer's last few seconds. */
export function playTick() {
  if (silent()) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(scaled(0.18), now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
    gain.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(880, now)
    osc.connect(gain)
    osc.start(now)
    osc.stop(now + 0.06)
  } catch {
    // Best-effort, same as playBuzzer().
  }
}

/** A quick three-note run-up for a streak bonus — a notch above playCorrect()'s two notes. */
export function playStreak() {
  if (silent()) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime

    ;[523.25, 659.25, 880].forEach((freq, i) => {
      const start = now + i * 0.07
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(scaled(0.3), start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
      gain.connect(ctx.destination)

      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)
      osc.connect(gain)
      osc.start(start)
      osc.stop(start + 0.3)
    })
  } catch {
    // Best-effort, same as playBuzzer().
  }
}

// --- Host soundboard: short, punchy, fully synthesized stings (same no-assets approach as the
// rest of this file) for the host to fire on a hotkey. Each is best-effort like the others.

function tone(ctx: AudioContext, type: OscillatorType, freq: number, start: number, dur: number, peak: number, endFreq?: number) {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(scaled(peak), start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  gain.connect(ctx.destination)
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (endFreq) osc.frequency.linearRampToValueAtTime(endFreq, start + dur)
  osc.connect(gain)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

function noiseBurst(ctx: AudioContext, start: number, dur: number, peak: number, filterFreq: number) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = filterFreq
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(scaled(peak), start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  src.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  src.start(start)
}

export type SoundboardSound = 'airhorn' | 'applause' | 'crickets' | 'trombone' | 'drumroll' | 'rimshot'

export function playSoundboard(sound: SoundboardSound) {
  if (silent()) return
  try {
    const ctx = getContext()
    const now = ctx.currentTime
    if (sound === 'airhorn') {
      // Three stacked detuned saws held and pitch-dipped, repeated as the classic "da-da-DAAA".
      ;[0, 0.22, 0.44].forEach((t, i) => {
        const dur = i === 2 ? 0.9 : 0.18
        ;[440, 554, 659].forEach((f) => tone(ctx, 'sawtooth', f * 1.005, now + t, dur, 0.1, f * 0.97))
      })
    } else if (sound === 'applause') {
      for (let i = 0; i < 40; i++) noiseBurst(ctx, now + Math.random() * 1.8, 0.05 + Math.random() * 0.05, 0.12, 1800 + Math.random() * 2500)
    } else if (sound === 'crickets') {
      for (let i = 0; i < 6; i++) {
        const t = now + i * 0.28
        tone(ctx, 'sine', 4300, t, 0.05, 0.05)
        tone(ctx, 'sine', 4300, t + 0.08, 0.05, 0.05)
      }
    } else if (sound === 'trombone') {
      const notes = [311, 294, 277, 262]
      notes.forEach((f, i) => tone(ctx, 'sawtooth', f, now + i * 0.3, i === 3 ? 0.9 : 0.28, 0.14, i === 3 ? f * 0.8 : undefined))
    } else if (sound === 'drumroll') {
      for (let i = 0; i < 28; i++) noiseBurst(ctx, now + i * 0.065, 0.06, 0.1 + i * 0.004, 200 + i * 8)
      noiseBurst(ctx, now + 28 * 0.065, 0.25, 0.3, 140)
    } else {
      // Rimshot: snare-ish hit, a pause, then snare + cymbal splash.
      noiseBurst(ctx, now, 0.1, 0.25, 400)
      noiseBurst(ctx, now + 0.28, 0.1, 0.25, 400)
      noiseBurst(ctx, now + 0.5, 0.45, 0.2, 7000)
    }
  } catch {
    // Best-effort, same as playBuzzer().
  }
}
