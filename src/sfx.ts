/**
 * Tiny Web-Audio sound engine — zero asset files, generates blips procedurally.
 * Respects a persisted mute flag and lazily creates the AudioContext on first
 * user gesture (required by browser autoplay policies).
 */

const MUTE_KEY = 'pastapoli.muted'

let ctx: AudioContext | null = null
let muted = (() => {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
})()

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch { return null }
}

type ToneOpts = { freq: number; dur: number; type?: OscillatorType; gain?: number; slideTo?: number }

function tone({ freq, dur, type = 'sine', gain = 0.14, slideTo }: ToneOpts) {
  if (muted) return
  const a = ac()
  if (!a) return
  const osc = a.createOscillator()
  const vol = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, a.currentTime)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), a.currentTime + dur)
  vol.gain.setValueAtTime(gain, a.currentTime)
  vol.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur)
  osc.connect(vol); vol.connect(a.destination)
  osc.start()
  osc.stop(a.currentTime + dur + 0.02)
}

export const sfx = {
  flap: () => tone({ freq: 520, dur: 0.09, type: 'square', gain: 0.08, slideTo: 720 }),
  coin: () => { tone({ freq: 880, dur: 0.06, type: 'triangle', gain: 0.12 }); setTimeout(() => tone({ freq: 1320, dur: 0.09, type: 'triangle', gain: 0.12 }), 55) },
  hit: () => tone({ freq: 180, dur: 0.22, type: 'sawtooth', gain: 0.18, slideTo: 60 }),
  score: () => tone({ freq: 660, dur: 0.08, type: 'sine', gain: 0.1 }),
  gameOver: () => {
    const notes = [523, 415, 330, 262]
    notes.forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.28, type: 'triangle', gain: 0.16 }), i * 150))
  },
  win: () => {
    const notes = [523, 659, 784, 1047]
    notes.forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.18, type: 'square', gain: 0.12 }), i * 90))
  },
  /** Rewarding "magical chime" for picking up a chest: bell arpeggio + shimmer tail. */
  chime: () => {
    const arp = [784, 1047, 1319, 1568]
    arp.forEach((f, i) => setTimeout(() => {
      tone({ freq: f, dur: 0.5, type: 'sine', gain: 0.13 })
      tone({ freq: f * 2, dur: 0.3, type: 'triangle', gain: 0.045 })
    }, i * 80))
    setTimeout(() => tone({ freq: 2093, dur: 0.9, type: 'sine', gain: 0.07 }), 340)
  },
  /** Chest lid popping open on the unboxing screen. */
  unbox: () => {
    tone({ freq: 300, dur: 0.12, type: 'square', gain: 0.1, slideTo: 900 })
    setTimeout(() => [1319, 1760, 2093].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.6, type: 'sine', gain: 0.11 }), i * 70)), 110)
  },
}

export function isMuted() { return muted }
export function setMuted(v: boolean) {
  muted = v
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0') } catch {}
}
export function toggleMuted() { setMuted(!muted); return muted }
