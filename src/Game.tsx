import { useEffect, useMemo, useRef, useState, useCallback, type ReactElement } from 'react'
import { CHARACTERS } from './characters'
import { AccessoryArt, CharacterComposite, CharacterView, TYPE_LABEL, cosmeticById, measureFitScale } from './cosmetics'
import { OBSTACLES } from './obstacles'
import { useActions, useGameState, type ChestDrop, type GameReward } from './store'
import { sfx } from './sfx'
import type { CoopConfig } from './coopConfig'
import { playRewardedAdSequence } from './ads/adService'
import { authorizeDouble, chargeReviveDiamonds, isAdRevive } from './economy/economyApi'
import ReviveOffer from './economy/ReviveOffer'

const GAME_WIDTH = 960
const GAME_HEIGHT = 620
const PHYSICS = {
  // Tuned in "per-60fps-frame" units; delta-time scaling keeps it identical on any refresh rate.
  GRAVITY: 0.78, FLAP_POWER: -11.5, TERMINAL_VELOCITY: 18, BASE_SPEED: 5.5,
  HARD_SPEED_MULTIPLIER: 1.4, PIPE_WIDTH: 80, PIPE_SPACING: 450,
  // Ghost is sized in game-units (like pipes/coins). Visual size is GHOST_SIZE;
  // the Game Over hitbox is a smaller AABB inset from that sprite box so
  // transparent pixels and the contact shadow (e.g. Limoncello) are ignored.
  GHOST_SIZE: 96, COIN_MAGNET_RADIUS: 72,
  HITBOX_INSET_X: 16, HITBOX_INSET_TOP: 14, HITBOX_INSET_BOTTOM: 24,
  BASE_GAP: 250, HARD_GAP: 200, MIN_GAP: 132,
}

// Deterministic PRNG so host & any observer generate the same world from one seed.
function LCG(seed: number) {
  return function () { seed = Math.imul(1664525, seed) + 1013904223; return (seed >>> 0) / 4294967296 }
}

// Difficulty curve: pipes speed up and the gap tightens as the score climbs (clamped).
function speedForScore(score: number, mode: 'NORMAL' | 'CHALLENGE' | 'COOP') {
  const base = mode === 'CHALLENGE' ? PHYSICS.BASE_SPEED * PHYSICS.HARD_SPEED_MULTIPLIER : PHYSICS.BASE_SPEED
  return base * (1 + Math.min(score * 0.018, 1.1)) // up to ~2.1x
}
function gapForScore(score: number, mode: 'NORMAL' | 'CHALLENGE' | 'COOP') {
  const base = mode === 'CHALLENGE' ? PHYSICS.HARD_GAP : PHYSICS.BASE_GAP
  return Math.max(PHYSICS.MIN_GAP, base - Math.min(score * 3.5, base - PHYSICS.MIN_GAP))
}

/** Collision AABB strictly inside the visual sprite. Bottom inset is larger to skip the ground shadow. */
function bodyHitbox(cx: number, cy: number) {
  const half = PHYSICS.GHOST_SIZE / 2
  return {
    left: cx - half + PHYSICS.HITBOX_INSET_X,
    right: cx + half - PHYSICS.HITBOX_INSET_X,
    top: cy - half + PHYSICS.HITBOX_INSET_TOP,
    bottom: cy + half - PHYSICS.HITBOX_INSET_BOTTOM,
  }
}

function hitboxOutOfBounds(box: { top: number; bottom: number }) {
  return box.top < 0 || box.bottom > GAME_HEIGHT
}

function hitboxHitsPipe(box: { left: number; right: number; top: number; bottom: number }, pipeX: number, gapTop: number, gapBottom: number) {
  if (box.right <= pipeX || box.left >= pipeX + PHYSICS.PIPE_WIDTH) return false
  return box.top < gapTop || box.bottom > gapBottom
}

/** Chests only appear deep into a run, then keep re-appearing on the same cadence. */
const CHEST_MIN_PIPE = 20
const CHEST_MAX_PIPE = 30
const CHEST_PICKUP_RADIUS = 82

function haptic(pattern: number | number[]) {
  try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern) } catch {}
}

type Pipe = { x: number; gapCenterY: number; gap: number; hasPassedScores: boolean }
type Coin = { x: number; y: number; looted1: boolean; looted2: boolean }
type Chest = { x: number; y: number; taken: boolean }
// Compact network snapshot (host -> guest). Short keys keep packets tiny.
type Snap = {
  p1Y: number; p2Y: number; p1V: number; p2V: number
  sc: number; cc: number; cd: number; kc: number
  pipes: { x: number; gc: number; g: number }[]
  coins: { x: number; y: number; l: boolean }[]
  chests: { x: number; y: number; t: boolean }[]
}

/** Glowing mythic gift — used for in-run pickups AND the unboxing stage. Never a cardboard box. */
export function GiftArt({ className, sparkle = false }: { className?: string; sparkle?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="Mythic gift chest">
      <defs>
        <linearGradient id="gift-front" x1="12%" y1="0%" x2="88%" y2="100%">
          <stop offset="0%" stopColor="#F06292" />
          <stop offset="42%" stopColor="#C2185B" />
          <stop offset="100%" stopColor="#880E4F" />
        </linearGradient>
        <linearGradient id="gift-side" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#AD1457" />
          <stop offset="100%" stopColor="#4A0628" />
        </linearGradient>
        <linearGradient id="gift-lid" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#FF80AB" />
          <stop offset="50%" stopColor="#E91E63" />
          <stop offset="100%" stopColor="#AD1457" />
        </linearGradient>
        <linearGradient id="gift-gold" x1="8%" y1="0%" x2="92%" y2="100%">
          <stop offset="0%" stopColor="#FFF8DC" />
          <stop offset="40%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#C9891A" />
        </linearGradient>
        <filter id="gift-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="4.5" floodColor="#FFD700" floodOpacity="0.85" />
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#FF80AB" floodOpacity="0.55" />
        </filter>
      </defs>
      <ellipse cx="60" cy="112" rx="30" ry="6" fill="#000" opacity="0.28" />
      {sparkle && (
        <g fill="#FFD700">
          <path d="M16 36 L18.4 42 L24 44 L18.4 46 L16 52 L13.6 46 L8 44 L13.6 42 Z" className="gift-sparkle" />
          <path d="M100 28 L102 33 L107 35 L102 37 L100 42 L98 37 L93 35 L98 33 Z" className="gift-sparkle" />
          <path d="M108 72 L109.6 76 L114 78 L109.6 80 L108 84 L106.4 80 L102 78 L106.4 76 Z" className="gift-sparkle" />
        </g>
      )}
      <g filter="url(#gift-glow)">
        <path d="M90 52 L108 42 L108 92 L90 104 Z" fill="url(#gift-side)" stroke="#1A1A1A" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M20 56 L90 56 L90 104 C86 108 24 108 20 104 Z" fill="url(#gift-front)" stroke="#1A1A1A" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M24 58 L44 62 L40 100 L22 96 Z" fill="#FFFFFF" opacity="0.18" />
        <path d="M18 50 L90 50 L108 40 L36 40 Z" fill="url(#gift-lid)" stroke="#1A1A1A" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M22 50 L48 50 L66 40 L40 40 Z" fill="#FFFFFF" opacity="0.28" />
        <path d="M52 50 L64 50 L64 104 L52 104 Z" fill="url(#gift-gold)" stroke="#1A1A1A" strokeWidth="2" />
        <path d="M52 50 L64 50 L78 42 L66 42 Z" fill="#FFE082" />
        <path d="M18 70 L90 70 L90 78 L18 78 Z" fill="url(#gift-gold)" stroke="#1A1A1A" strokeWidth="2" />
        <path d="M90 70 L108 60 L108 68 L90 78 Z" fill="#C9891A" />
        <path d="M60 42 Q26 -2 10 28 Q38 22 60 42 Z" fill="url(#gift-gold)" stroke="#1A1A1A" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M60 42 Q94 -2 110 28 Q82 22 60 42 Z" fill="url(#gift-gold)" stroke="#1A1A1A" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M60 42 Q32 8 18 26 Q40 22 60 42 Z" fill="#FFF8DC" opacity="0.5" />
        <path d="M60 42 Q88 8 102 26 Q80 22 60 42 Z" fill="#C9891A" opacity="0.35" />
        <ellipse cx="60" cy="44" rx="11" ry="9" fill="url(#gift-gold)" stroke="#1A1A1A" strokeWidth="2.2" />
        <ellipse cx="57" cy="41" rx="4" ry="3.2" fill="#FFF8DC" />
      </g>
    </svg>
  )
}

/**
 * Rarity drives how loud the reveal is: a Common accessory gets a small puff of
 * particles, a Mythic character card gets the full presentation.
 */
type RevealTier = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC'

const REVEAL_TIER: Record<RevealTier, {
  accent: string
  aura: string
  particles: number
  colors: string[]
  holo: boolean
  shout: string
}> = {
  COMMON: { accent: '#8ec5ff', aura: 'rgba(142,197,255,0.28)', particles: 8, colors: ['#8ec5ff', '#d7ecff'], holo: false, shout: 'Nice find' },
  RARE: { accent: '#b98bff', aura: 'rgba(185,139,255,0.40)', particles: 14, colors: ['#b98bff', '#e2d2ff'], holo: false, shout: 'Rare drop!' },
  EPIC: { accent: '#ff7ad9', aura: 'rgba(255,122,217,0.48)', particles: 20, colors: ['#ff7ad9', '#c58bff', '#ffd7f4'], holo: true, shout: 'Epic drop!' },
  LEGENDARY: { accent: '#ffd24d', aura: 'rgba(255,210,77,0.55)', particles: 28, colors: ['#FFD700', '#FFEAA0', '#FFB300'], holo: true, shout: 'Legendary!' },
  MYTHIC: { accent: '#7cf3ff', aura: 'rgba(124,243,255,0.62)', particles: 36, colors: ['#7cf3ff', '#FFD700', '#ff7ad9', '#ffffff'], holo: true, shout: 'MYTHIC!' },
}

function makeConfetti(n: number, colors: string[]) {
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 + (i % 4) * 0.17
    const dist = 100 + (i % 5) * 30
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      rot: 90 + i * 37,
      star: i % 3 === 0,
      color: colors[i % colors.length],
      delay: (i % 6) * 18,
      size: i % 3 === 0 ? 14 : 9,
    }
  })
}

export default function Game({ mode = 'NORMAL', coopConfig, connection, onClose, onReplay }: { mode: 'NORMAL'|'CHALLENGE'|'COOP', coopConfig: CoopConfig, connection: any, onClose: () => void, onReplay: () => void }) {
  const { obstacle, selected, equipped, diamonds } = useGameState()
  const { recordGame } = useActions()

  const isCoop = mode === 'COOP'
  const isHost = coopConfig.isHost
  // Host privilege: in co-op both players render the HOST's equipped background.
  const activeBgId = isCoop ? (coopConfig.hostBg || obstacle) : obstacle
  const activeEnvironment = OBSTACLES.find((o) => o.id === activeBgId) ?? OBSTACLES[0]
  const guest = isCoop && !isHost      // guest = pure renderer, host is authoritative
  const simulates = !guest             // solo + host run the physics engine

  const p1CharId = isCoop ? coopConfig.p1Char : selected
  // Guest is always P2: use local `selected` so a host sync cannot overwrite their sprite.
  const p2CharId = isCoop && !isHost ? selected : coopConfig.p2Char
  const p1CharData = CHARACTERS.find(c => c.id === p1CharId) ?? CHARACTERS[0]
  const p2CharData = CHARACTERS.find(c => c.id === p2CharId) ?? CHARACTERS[0]

  const BASE_X_FRONT = GAME_WIDTH * 0.3
  const BASE_X_BACK = GAME_WIDTH * 0.2
  const P1_X = coopConfig.frontPlayer === 'P1' ? BASE_X_FRONT : BASE_X_BACK
  const P2_X = coopConfig.frontPlayer === 'P2' ? BASE_X_FRONT : BASE_X_BACK

  const [phase, setPhase] = useState<'playing' | 'unboxing' | 'over'>('playing')
  const [paused, setPaused] = useState(false)
  const [summary, setSummary] = useState<GameReward | null>(null)
  const [countLabel, setCountLabel] = useState<string | null>(isCoop ? '3' : null)
  const [shake, setShake] = useState(false)
  const [dying, setDying] = useState(false)
  const [particles, setParticles] = useState<{ id: number; x: number; y: number }[]>([])
  const [sharing, setSharing] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [coinPulse, setCoinPulse] = useState(0)   // bumps to retrigger the HUD bounce
  const [chestPulse, setChestPulse] = useState(0) // same, for the chest counter
  const [offerRevive, setOfferRevive] = useState(false)
  const [reviveBusy, setReviveBusy] = useState(false)
  const [reviveError, setReviveError] = useState<string | null>(null)
  const [, forceReactRender] = useState(0)
  const rerender = useCallback(() => forceReactRender(n => (n + 1) % 1_000_000), [])

  const countdownRef = useRef(isCoop)   // true while the 3-2-1-GO overlay blocks play
  const settledRef = useRef(false)      // guarantees the run settles exactly once
  const dyingRef = useRef(false)        // guards the death sequence (ref = stable callback)
  const reviveCountRef = useRef(0)
  const particleId = useRef(0)
  const finalRef = useRef({ score: 0, collected: 0, chests: 0 })

  const p1Y = useRef(GAME_HEIGHT / 2); const p1Vel = useRef(0)
  const p2Y = useRef(GAME_HEIGHT / 2); const p2Vel = useRef(0)

  const teamLivesCount = useRef(isCoop ? 2 : 1)
  const damageCooldownFrames = useRef(0)

  const worldPipes = useRef<Pipe[]>([])
  const worldCoins = useRef<Coin[]>([])
  const worldChests = useRef<Chest[]>([])
  const netSnap = useRef<Snap | null>(null)

  const pipesSpawned = useRef(0)
  const nextChestPipe = useRef(0)   // 0 = not rolled yet

  const internalScore = useRef(0)
  const internalCoins = useRef(0)
  const internalChests = useRef(0)
  const animationFrameId = useRef(0)
  const pausedRef = useRef(false)
  const lastTimeRef = useRef(0)

  // Award the run exactly once and capture the transparent breakdown.
  // Chests collected during the run push us through the Unboxing phase first.
  const settleRun = useCallback((score: number, collected: number, chests: number) => {
    if (settledRef.current) return   // never settle twice (OVER packet + local, etc.)
    settledRef.current = true
    const result = recordGame(score, collected, mode)
    setSummary(result)
    if (chests > 0) {
      setPhase('unboxing')
      haptic([40, 30, 80])
    } else {
      setPhase('over')
      haptic([50, 40, 90])
      sfx.gameOver()
    }
  }, [recordGame, mode])

  // Impact juice: screen shake + the ghost tumbling down before the panel slides in.
  const beginDeathSequence = useCallback((score: number, collected: number, chests: number) => {
    if (settledRef.current || dyingRef.current) return
    dyingRef.current = true
    finalRef.current = { score, collected, chests }
    setDying(true)
    setShake(true)
    haptic([30, 30, 60]); sfx.hit()
    window.setTimeout(() => setShake(false), 420)
    window.setTimeout(() => {
      setOfferRevive(true)
      setReviveError(null)
    }, 720)
  }, [])

  // Floating "+1" pickup feedback.
  const spawnPickup = useCallback((x: number, y: number) => {
    const id = ++particleId.current
    setParticles((ps) => [...ps, { id, x, y }])
    window.setTimeout(() => setParticles((ps) => ps.filter((p) => p.id !== id)), 700)
  }, [])

  // --- CO-OP COUNTDOWN (3 · 2 · 1 · GO!) ---
  useEffect(() => {
    if (!isCoop) { countdownRef.current = false; return }
    countdownRef.current = true
    let n = 3
    setCountLabel('3')
    const iv = window.setInterval(() => {
      n -= 1
      if (n > 0) setCountLabel(String(n))
      else if (n === 0) { setCountLabel('GO!'); sfx.score() }
      else { setCountLabel(null); countdownRef.current = false; window.clearInterval(iv) }
    }, 700)
    return () => window.clearInterval(iv)
  }, [isCoop])

  // --- NETWORK RECEIVER ---
  useEffect(() => {
    if (!connection) return
    const onData = (packet: any) => {
      if (!packet || typeof packet !== 'object') return
      switch (packet.opCode) {
        case 'FLAP':
          // Host authoritative: guest's flap moves P2 on the host sim.
          if (isHost) p2Vel.current = PHYSICS.FLAP_POWER
          break
        case 'STATE':
          // Guest renders whatever the host sends — zero drift.
          if (guest) { netSnap.current = packet.snap as Snap; rerender() }
          break
        case 'DOWNED':
          if (guest) beginDeathSequence(packet.payload.score, packet.payload.collected, packet.payload.chests ?? 0)
          break
        case 'REVIVE':
          if (guest) {
            dyingRef.current = false
            setDying(false)
            setOfferRevive(false)
          }
          break
        case 'OVER':
          if (guest) {
            dyingRef.current = true
            setDying(true)
            setOfferRevive(false)
            settleRun(packet.payload.score, packet.payload.collected, packet.payload.chests ?? 0)
          }
          break
      }
    }
    connection.on('data', onData)
    return () => { try { connection.off('data', onData) } catch {} }
  }, [connection, isHost, guest, beginDeathSequence, settleRun, rerender])

  const send = useCallback((msg: any) => {
    try { if (connection && connection.open) connection.send(msg) } catch {}
  }, [connection])

  const giveUp = useCallback(() => {
    if (settledRef.current) return
    setOfferRevive(false)
    const f = finalRef.current
    if (isCoop) send({ opCode: 'OVER', payload: { score: f.score, collected: f.collected, chests: f.chests } })
    settleRun(f.score, f.collected, f.chests)
  }, [isCoop, send, settleRun])

  const tryRevive = useCallback(async () => {
    if (reviveBusy || settledRef.current) return
    const next = reviveCountRef.current + 1
    setReviveBusy(true)
    setReviveError(null)
    try {
      if (isAdRevive(next)) {
        const watched = await playRewardedAdSequence(2)
        if (!watched) {
          setReviveError('Watch both ads to revive.')
          return
        }
      } else {
        const charged = await chargeReviveDiamonds(next, diamonds)
        if (!charged.ok) {
          setReviveError(charged.message)
          return
        }
      }
      reviveCountRef.current = next
      dyingRef.current = false
      setDying(false)
      setOfferRevive(false)
      teamLivesCount.current = 1
      damageCooldownFrames.current = 150
      p1Vel.current = PHYSICS.FLAP_POWER
      if (isCoop) p2Vel.current = PHYSICS.FLAP_POWER
      lastTimeRef.current = 0
      if (isCoop) send({ opCode: 'REVIVE' })
    } finally {
      setReviveBusy(false)
    }
  }, [reviveBusy, diamonds, isCoop, send])

  // --- INPUT ---
  const dispatchJumpAction = useCallback(() => {
    if (phase === 'over' || phase === 'unboxing' || offerRevive || pausedRef.current) return
    haptic(8); sfx.flap()
    if (guest) { send({ opCode: 'FLAP' }); return }   // guest only sends intent
    p1Vel.current = PHYSICS.FLAP_POWER                 // solo / host control P1 locally
  }, [phase, guest, send])

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); dispatchJumpAction() } }
    window.addEventListener('keydown', keyHandler)
    return () => window.removeEventListener('keydown', keyHandler)
  }, [dispatchJumpAction])

  // --- PAUSE ON TAB HIDE (prevents unfair deaths & saves battery) ---
  useEffect(() => {
    const onVis = () => {
      const hidden = document.visibilityState === 'hidden'
      pausedRef.current = hidden
      setPaused(hidden)
      if (!hidden) lastTimeRef.current = 0 // reset dt so we don't jump on resume
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // --- PHYSICS ENGINE (host / solo only) ---
  useEffect(() => {
    if (phase !== 'playing' || !simulates) return
    let active = true
    const prng = LCG(isCoop ? (coopConfig.gameSeed || 1) : (Date.now() >>> 0) || 1)
    lastTimeRef.current = 0

    const tick = (now: number) => {
      if (!active) return

      if (pausedRef.current) { lastTimeRef.current = now; animationFrameId.current = requestAnimationFrame(tick); return }

      // Hold the world still until the co-op 3-2-1-GO countdown finishes.
      if (countdownRef.current) { lastTimeRef.current = now; animationFrameId.current = requestAnimationFrame(tick); return }

      // Freeze after a death so the revive overlay can resume this same world.
      if (dyingRef.current) { lastTimeRef.current = now; animationFrameId.current = requestAnimationFrame(tick); return }

      try {

      // Delta-time in "60fps frames"; clamp to avoid tunneling after a stall.
      if (!lastTimeRef.current) lastTimeRef.current = now
      const dt = Math.min(Math.max((now - lastTimeRef.current) / (1000 / 60), 0), 3)
      lastTimeRef.current = now

      const score = internalScore.current
      const speed = speedForScore(score, mode)

      p1Vel.current = Math.min(p1Vel.current + PHYSICS.GRAVITY * dt, PHYSICS.TERMINAL_VELOCITY)
      p1Y.current += p1Vel.current * dt
      if (isCoop) {
        p2Vel.current = Math.min(p2Vel.current + PHYSICS.GRAVITY * dt, PHYSICS.TERMINAL_VELOCITY)
        p2Y.current += p2Vel.current * dt
      }

      worldPipes.current.forEach(p => p.x -= speed * dt)
      worldCoins.current.forEach(c => c.x -= speed * dt)
      worldChests.current.forEach(k => k.x -= speed * dt)

      const lastPipe = worldPipes.current[worldPipes.current.length - 1]
      if (!lastPipe || lastPipe.x < GAME_WIDTH - PHYSICS.PIPE_SPACING) {
        const gap = gapForScore(score, mode)
        const margin = gap / 2 + 60
        const gapCenterY = margin + prng() * (GAME_HEIGHT - margin * 2)
        worldPipes.current.push({ x: GAME_WIDTH + PHYSICS.PIPE_WIDTH, gapCenterY, gap, hasPassedScores: false })
        const cx = GAME_WIDTH + PHYSICS.PIPE_WIDTH + PHYSICS.PIPE_SPACING / 2
        if (mode === 'CHALLENGE') {
          worldCoins.current.push({ x: cx, y: gapCenterY, looted1: false, looted2: false }, { x: cx + 44, y: gapCenterY - 40, looted1: false, looted2: false })
        } else {
          worldCoins.current.push({ x: cx, y: gapCenterY, looted1: false, looted2: false })
        }

        // Chest cadence: nothing for the first ~20 pillars, then one every 20-30.
        pipesSpawned.current += 1
        if (nextChestPipe.current === 0) {
          nextChestPipe.current = CHEST_MIN_PIPE + Math.floor(prng() * (CHEST_MAX_PIPE - CHEST_MIN_PIPE + 1))
        }
        if (pipesSpawned.current === nextChestPipe.current) {
          worldChests.current.push({ x: cx + PHYSICS.PIPE_SPACING * 0.22, y: gapCenterY, taken: false })
          nextChestPipe.current += CHEST_MIN_PIPE + Math.floor(prng() * (CHEST_MAX_PIPE - CHEST_MIN_PIPE + 1))
        }
      }

      worldPipes.current = worldPipes.current.filter(p => p.x > -200)
      worldCoins.current = worldCoins.current.filter(c => c.x > -200)
      worldChests.current = worldChests.current.filter(k => k.x > -200)

      const checkX = isCoop ? Math.min(P1_X, P2_X) : P1_X
      worldPipes.current.forEach(p => {
        if (!p.hasPassedScores && p.x + PHYSICS.PIPE_WIDTH < checkX) { p.hasPassedScores = true; internalScore.current += 1; sfx.score() }
      })

      let frameCoins = 0
      worldCoins.current.forEach(c => {
        if (!c.looted1 && Math.hypot(P1_X - c.x, p1Y.current - c.y) < PHYSICS.COIN_MAGNET_RADIUS) { c.looted1 = true; frameCoins++; spawnPickup(c.x, c.y) }
        if (isCoop && !c.looted2 && Math.hypot(P2_X - c.x, p2Y.current - c.y) < PHYSICS.COIN_MAGNET_RADIUS) { c.looted2 = true; frameCoins++; spawnPickup(c.x, c.y) }
      })
      if (frameCoins > 0) { internalCoins.current += frameCoins; haptic(5); sfx.coin() }

      // Chests are pickups, NOT hazards — touching one banks it and plays a chime.
      worldChests.current.forEach(k => {
        if (k.taken) return
        const grabbed =
          Math.hypot(P1_X - k.x, p1Y.current - k.y) < CHEST_PICKUP_RADIUS ||
          (isCoop && Math.hypot(P2_X - k.x, p2Y.current - k.y) < CHEST_PICKUP_RADIUS)
        if (grabbed) {
          k.taken = true
          internalChests.current += 1
          haptic([12, 20, 12])
          sfx.chime()
        }
      })

      // --- Collisions (bounds + pipes): padded body AABB, not the full sprite ---
      let hit = false
      const p1Box = bodyHitbox(P1_X, p1Y.current)
      const p2Box = isCoop ? bodyHitbox(P2_X, p2Y.current) : null
      if (hitboxOutOfBounds(p1Box) || (p2Box && hitboxOutOfBounds(p2Box))) hit = true
      worldPipes.current.forEach(p => {
        const top = p.gapCenterY - p.gap / 2
        const bottom = p.gapCenterY + p.gap / 2
        if (hitboxHitsPipe(p1Box, p.x, top, bottom)) hit = true
        if (p2Box && hitboxHitsPipe(p2Box, p.x, top, bottom)) hit = true
      })

      if (hit && damageCooldownFrames.current <= 0) {
        teamLivesCount.current -= 1
        haptic(20); sfx.hit()
        if (teamLivesCount.current > 0) {
          damageCooldownFrames.current = 120
          p1Vel.current = PHYSICS.FLAP_POWER * 0.7
          if (isCoop) p2Vel.current = PHYSICS.FLAP_POWER * 0.7
        } else {
          const payload = { score: internalScore.current, collected: Math.floor(internalCoins.current), chests: internalChests.current }
          if (isCoop) send({ opCode: 'DOWNED', payload })
          beginDeathSequence(payload.score, payload.collected, payload.chests)
        }
      }
      if (damageCooldownFrames.current > 0) damageCooldownFrames.current -= dt

      // Broadcast authoritative state to the guest.
      if (isCoop) {
        const snap: Snap = {
          p1Y: p1Y.current, p2Y: p2Y.current, p1V: p1Vel.current, p2V: p2Vel.current,
          sc: internalScore.current, cc: Math.floor(internalCoins.current), cd: damageCooldownFrames.current,
          kc: internalChests.current,
          pipes: worldPipes.current.map(p => ({ x: p.x, gc: p.gapCenterY, g: p.gap })),
          coins: worldCoins.current.map(c => ({ x: c.x, y: c.y, l: c.looted1 || c.looted2 })),
          chests: worldChests.current.map(k => ({ x: k.x, y: k.y, t: k.taken })),
        }
        send({ opCode: 'STATE', snap })
      }

      rerender()

      } catch (err) {
        // A single bad frame must never end the run — log and keep flying.
        console.error('Game loop frame skipped:', err)
        lastTimeRef.current = now
      }

      if (active) animationFrameId.current = requestAnimationFrame(tick)
    }

    animationFrameId.current = requestAnimationFrame(tick)
    return () => { active = false; cancelAnimationFrame(animationFrameId.current) }
  }, [phase, simulates, isCoop, mode, P1_X, P2_X, beginDeathSequence, spawnPickup, send, coopConfig.gameSeed, rerender])

  // --- Resolve what to draw: guest reads the network snapshot, everyone else reads local refs ---
  const s = guest ? netSnap.current : null
  const p1yV = s ? s.p1Y : p1Y.current
  const p1vV = s ? s.p1V : p1Vel.current
  const p2yV = s ? s.p2Y : p2Y.current
  const p2vV = s ? s.p2V : p2Vel.current
  const scoreV = s ? s.sc : internalScore.current
  const coinsHudV = s ? s.cc : Math.floor(internalCoins.current)
  const chestsHudV = s ? (s.kc ?? 0) : internalChests.current
  const cdV = s ? s.cd : damageCooldownFrames.current
  const pipesToRender = s ? s.pipes.map(p => ({ x: p.x, gapCenterY: p.gc, gap: p.g })) : worldPipes.current
  const coinsToRender = s ? s.coins.map(c => ({ x: c.x, y: c.y, looted: c.l })) : worldCoins.current.map(c => ({ x: c.x, y: c.y, looted: c.looted1 || c.looted2 }))
  const chestsToRender = s ? (s.chests ?? []).map(k => ({ x: k.x, y: k.y, taken: k.t })) : worldChests.current.map(k => ({ x: k.x, y: k.y, taken: k.taken }))
  const waitingForHost = guest && !netSnap.current && phase === 'playing'
  const ghostWpct = (PHYSICS.GHOST_SIZE / GAME_WIDTH) * 100
  const ghostHpct = (PHYSICS.GHOST_SIZE / GAME_HEIGHT) * 100

  // Bounce + glow the coin counter whenever the total ticks up.
  const prevCoinsRef = useRef(coinsHudV)
  useEffect(() => {
    if (coinsHudV > prevCoinsRef.current) setCoinPulse((n) => n + 1)
    prevCoinsRef.current = coinsHudV
  }, [coinsHudV])

  const prevChestsRef = useRef(chestsHudV)
  useEffect(() => {
    if (chestsHudV > prevChestsRef.current) setChestPulse((n) => n + 1)
    prevChestsRef.current = chestsHudV
  }, [chestsHudV])

  // Compose a shareable score card (equipped ghost + score) as an SVG → PNG.
  const buildShareSVG = (renderToStaticMarkup: (n: ReactElement) => string) => {
    const eq = equipped[p1CharData.id] ?? {}
    const box = 'x="180" y="162" width="240" height="240"'
    // Same composite the player sees, just nested into the card at a fixed box.
    const art = renderToStaticMarkup(<CharacterComposite charId={p1CharData.id} equipped={eq} fitScale={measureFitScale(p1CharData.id, eq)} />).replace(
      '<svg ',
      `<svg ${box} `,
    )
    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
      <defs><radialGradient id="shareBg" cx="50%" cy="28%" r="90%"><stop offset="0%" stop-color="#301e4d"/><stop offset="100%" stop-color="#100818"/></radialGradient></defs>
      <rect width="600" height="600" rx="36" fill="url(#shareBg)"/>
      <text x="300" y="78" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-size="36" font-weight="700" fill="#ffd24d">PASTAPOLI</text>
      ${art}
      <text x="300" y="470" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-size="22" letter-spacing="4" fill="#8ec5ff">${isCoop ? 'TEAM SCORE' : 'SCORE'}</text>
      <text x="300" y="540" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-size="80" font-weight="800" fill="#ffffff">${scoreV}</text>
      <text x="300" y="576" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-size="22" fill="#ffe6a3">+${summary?.totalReward ?? coinsHudV} coins</text>
    </svg>`
  }

  const shareScore = async () => {
    if (sharing) return
    setSharing(true); setShareMsg(null)
    try {
      const { renderToStaticMarkup } = await import('react-dom/server')
      const svg = buildShareSVG(renderToStaticMarkup)
      const img = new Image()
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) })
      const canvas = document.createElement('canvas')
      canvas.width = 600; canvas.height = 600
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(img, 0, 0, 600, 600)
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
      if (!blob) throw new Error('no blob')
      const file = new File([blob], 'pastapoli-score.png', { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> }
      if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: 'Pastapoli', text: `I scored ${scoreV} points in Pastapoli! 🍝` })
        setShareMsg('Shared! 🎉')
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob); a.download = 'pastapoli-score.png'; a.click()
        URL.revokeObjectURL(a.href)
        setShareMsg('Image downloaded! 📥')
      }
    } catch (err) {
      console.error('Share failed:', err)
      setShareMsg('Sharing failed')
    } finally {
      setSharing(false)
      window.setTimeout(() => setShareMsg(null), 2600)
    }
  }

  return (
    <div className="fixed inset-0 z-[999] bg-black font-display flex flex-col items-center justify-center selection:bg-transparent">
      <div className={`relative w-full h-full max-h-[100vh] md:max-h-[90vh] md:max-w-4xl md:rounded-[48px] md:border-8 border-black overflow-hidden shadow-2xl bg-[#11091c] ${shake ? 'screen-shake' : ''}`} style={{ background: activeEnvironment.backgroundStyle, aspectRatio: `${GAME_WIDTH} / ${GAME_HEIGHT}`, touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTapHighlightColor: 'transparent' }} onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => { e.preventDefault(); dispatchJumpAction() }}>
        {activeEnvironment.Background && <activeEnvironment.Background />}

        {pipesToRender.map((p, i) => {
          const gapTop = p.gapCenterY - p.gap / 2
          const gapBottom = p.gapCenterY + p.gap / 2
          const capW = PHYSICS.PIPE_WIDTH * 1.14
          const capH = capW * (44 / 120) // keep cap-face proportions
          const shaftLeftPct = (p.x / GAME_WIDTH) * 100
          const shaftWidthPct = (PHYSICS.PIPE_WIDTH / GAME_WIDTH) * 100
          const capLeftPct = ((p.x + PHYSICS.PIPE_WIDTH / 2 - capW / 2) / GAME_WIDTH) * 100
          const capWidthPct = (capW / GAME_WIDTH) * 100
          const capHeightPct = (capH / GAME_HEIGHT) * 100
          const fill = { width: '100%', height: '100%', display: 'block' } as const
          return (
            <div key={`pipe-${i}`}>
              <div className="absolute" style={{ left: `${shaftLeftPct}%`, top: 0, width: `${shaftWidthPct}%`, height: `${(gapTop / GAME_HEIGHT) * 100}%` }}>
                <activeEnvironment.Piece style={fill} />
              </div>
              <div className="absolute" style={{ left: `${capLeftPct}%`, top: `${((gapTop - capH) / GAME_HEIGHT) * 100}%`, width: `${capWidthPct}%`, height: `${capHeightPct}%` }}>
                <activeEnvironment.Cap style={fill} />
              </div>
              <div className="absolute" style={{ left: `${shaftLeftPct}%`, top: `${(gapBottom / GAME_HEIGHT) * 100}%`, width: `${shaftWidthPct}%`, bottom: 0 }}>
                <activeEnvironment.Piece style={fill} />
              </div>
              <div className="absolute" style={{ left: `${capLeftPct}%`, top: `${(gapBottom / GAME_HEIGHT) * 100}%`, width: `${capWidthPct}%`, height: `${capHeightPct}%` }}>
                <activeEnvironment.Cap style={fill} />
              </div>
            </div>
          )
        })}

        {coinsToRender.map((c, i) => (
          <div key={`coin-${i}`} className="absolute pointer-events-none z-[15]" style={{ left: `${(c.x / GAME_WIDTH) * 100}%`, top: `${(c.y / GAME_HEIGHT) * 100}%`, width: '34px', height: '34px', opacity: c.looted ? 0 : 1, transform: `translate(-50%, -50%) scale(${c.looted ? 1.8 : 1})`, transition: 'opacity 0.25s ease, transform 0.25s ease' }}>
            <svg viewBox="0 0 24 24" width="34" height="34" className="drop-shadow-[0_0_6px_rgba(255,207,77,0.7)]">
              <circle cx="12" cy="12" r="11" fill="#f5a623" />
              <circle cx="12" cy="12" r="8.5" fill="#ffcf4d" />
              <circle cx="12" cy="12" r="5" fill="none" stroke="#f5a623" strokeWidth="1.4" />
              <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#b26b00">$</text>
            </svg>
          </div>
        ))}

        {/* Mythic gift pickups — glowing 🎁, never a cardboard box. */}
        {chestsToRender.map((k, i) => (
          <div
            key={`chest-${i}`}
            className={`absolute pointer-events-none z-[16] ${k.taken ? '' : 'float-slow gift-drop-glow'}`}
            style={{ left: `${(k.x / GAME_WIDTH) * 100}%`, top: `${(k.y / GAME_HEIGHT) * 100}%`, width: '68px', height: '68px', opacity: k.taken ? 0 : 1, transform: `translate(-50%, -50%) scale(${k.taken ? 1.9 : 1})`, transition: 'opacity 0.3s ease, transform 0.3s ease' }}
          >
            <GiftArt sparkle className="h-full w-full" />
          </div>
        ))}

        {/* Coin pickup feedback: floating "+1" with a little star burst. */}
        {particles.map((p) => (
          <div key={`pk-${p.id}`} className="coin-pop absolute pointer-events-none z-[25] font-black text-[#6ee7a8] drop-shadow-[0_0_6px_rgba(110,231,168,0.7)]" style={{ left: `${(p.x / GAME_WIDTH) * 100}%`, top: `${(p.y / GAME_HEIGHT) * 100}%`, fontSize: '20px' }}>
            <span className="relative">+1<span className="absolute -right-3 -top-2 text-[#ffd24d] text-xs">✦</span></span>
          </div>
        ))}

        {isCoop && (
          <div className={`absolute pointer-events-none z-20 ${dying ? 'death-fall' : ''}`} style={{ left: `${(P2_X / GAME_WIDTH) * 100}%`, top: `${(p2yV / GAME_HEIGHT) * 100}%`, width: `${ghostWpct}%`, height: `${ghostHpct}%`, overflow: 'visible', transform: `translate(-50%, -50%) rotate(${Math.max(-30, Math.min(80, p2vV * 4))}deg)`, opacity: !dying && cdV > 0 ? 0.35 : 1 }}>
            <CharacterView charId={p2CharData.id} className="h-full w-full drop-shadow-xl" />
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#8ec5ff] text-[#170d24] px-2 py-0.5 rounded-md text-[10px] font-black uppercase">P2</div>
          </div>
        )}

        <div className={`absolute pointer-events-none z-30 ${dying ? 'death-fall' : ''}`} style={{ left: `${(P1_X / GAME_WIDTH) * 100}%`, top: `${(p1yV / GAME_HEIGHT) * 100}%`, width: `${ghostWpct}%`, height: `${ghostHpct}%`, overflow: 'visible', transform: `translate(-50%, -50%) rotate(${Math.max(-30, Math.min(80, p1vV * 4))}deg)`, opacity: !dying && cdV > 0 ? 0.35 : 1 }}>
          <CharacterView charId={p1CharData.id} className="h-full w-full drop-shadow-xl" />
          {isCoop && <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#6ee7a8] text-[#170d24] px-2 py-0.5 rounded-md text-[10px] font-black uppercase">P1</div>}
        </div>

        <div className="absolute flex justify-between items-start pointer-events-none z-40" style={{ top: 'max(2rem, env(safe-area-inset-top))', left: 'max(2rem, env(safe-area-inset-left))', right: 'max(2rem, env(safe-area-inset-right))' }}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div key={coinPulse} className="coin-hud-pop bg-[#170d24]/90 border border-white/10 px-6 py-3 rounded-2xl flex items-center"><span className="text-2xl font-black text-[#ffe6a3]">🪙 {coinsHudV}</span></div>
            <div key={`chest-hud-${chestPulse}`} className="coin-hud-pop bg-[#170d24]/90 border border-white/10 px-6 py-3 rounded-2xl flex items-center"><span className="text-2xl font-black text-[#ffd24d]">🎁 {chestsHudV}</span></div>
          </div>
          <div className="text-8xl font-black text-white drop-shadow-lg">{scoreV}</div>
        </div>

        {countLabel && phase === 'playing' && (
          <div className="absolute inset-0 flex items-center justify-center z-[93] bg-black/30">
            <span key={countLabel} className="countdown-pop font-black text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.6)]" style={{ fontSize: countLabel === 'GO!' ? '6rem' : '9rem', color: countLabel === 'GO!' ? '#6ee7a8' : '#ffffff' }}>
              {countLabel}
            </span>
          </div>
        )}

        {waitingForHost && !countLabel && (
          <div className="absolute inset-0 flex items-center justify-center z-[90] bg-black/40">
            <p className="text-2xl font-black text-white animate-pulse">Syncing with host...</p>
          </div>
        )}

        {paused && phase === 'playing' && !offerRevive && (
          <div className="absolute inset-0 flex items-center justify-center z-[95] bg-black/70 backdrop-blur-sm">
            <p className="text-5xl font-black text-white">⏸ PAUSED</p>
          </div>
        )}

        {offerRevive && phase === 'playing' && (
          <div className="game-over-slide absolute inset-0 bg-[#0a0510]/95 backdrop-blur-xl flex flex-col items-center justify-center z-[100] p-6" onPointerDown={(e) => e.stopPropagation()}>
            <h2 className="text-6xl font-black text-white mb-2 drop-shadow-xl text-center">{isCoop ? 'TEAM DOWN' : 'GAME OVER'}</h2>
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl mb-6">
              <div className="flex-1 bg-[#2a1c42] p-5 rounded-3xl text-center"><p className="text-[#8ec5ff] uppercase font-black text-xs mb-1">Score</p><p className="text-4xl font-black text-white">{scoreV}</p></div>
              <div className="flex-1 bg-[#241a33] p-5 rounded-3xl text-center"><p className="text-white/50 uppercase font-black text-xs mb-1">Collected</p><p className="text-4xl font-black text-white/90">{finalRef.current.collected}</p></div>
            </div>
            {guest ? (
              <p className="text-lg font-black text-white/70 animate-pulse">Host is choosing a revive…</p>
            ) : (
              <ReviveOffer
                nextRevive={reviveCountRef.current + 1}
                diamonds={diamonds}
                busy={reviveBusy}
                error={reviveError}
                onConfirm={() => { void tryRevive() }}
                onSkip={giveUp}
              />
            )}
          </div>
        )}

        {phase === 'unboxing' && (
          <UnboxingOverlay
            count={finalRef.current.chests}
            onDone={() => { setPhase('over'); sfx.gameOver() }}
          />
        )}

        {phase === 'over' && (
          <div className="game-over-slide absolute inset-0 bg-[#0a0510]/95 backdrop-blur-xl flex flex-col items-center justify-center z-[100] p-6">
            <h2 className="text-6xl font-black text-white mb-2 drop-shadow-xl text-center">{isCoop ? 'TEAM OVER' : 'GAME OVER'}</h2>
            {summary?.isNewBest && <p className="mb-6 text-xl font-black text-[#ffd24d] animate-pulse">🏆 NEW RECORD!</p>}
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl mb-6">
              <div className="flex-1 bg-[#2a1c42] p-5 rounded-3xl text-center"><p className="text-[#8ec5ff] uppercase font-black text-xs mb-1">Score</p><p className="text-4xl font-black text-white">{scoreV}</p></div>
              <div className="flex-1 bg-[#241a33] p-5 rounded-3xl text-center"><p className="text-white/50 uppercase font-black text-xs mb-1">Collected</p><p className="text-4xl font-black text-white/90">{summary?.collected ?? 0}</p></div>
            </div>
            <div className="w-full max-w-xl bg-[#3a2822] p-5 rounded-3xl text-center mb-8">
              <p className="text-[#ffd24d]/70 uppercase font-black text-xs mb-1">Total Earned</p>
              <p className="text-5xl font-black text-[#ffd24d]">+{summary?.totalReward ?? 0} 🪙</p>
              <p className="text-[#8ec5ff] text-sm font-bold mt-2">+{summary?.xpGained ?? 0} XP</p>
            </div>
            <div className="flex gap-4 w-full max-w-xl">
              <button onClick={onReplay} className="flex-1 rounded-[32px] bg-[#6ee7a8] py-5 text-xl font-black uppercase text-[#170d24] shadow-lg">REPLAY</button>
              <button onClick={onClose} className="flex-1 rounded-[32px] bg-white/10 py-5 text-xl font-black uppercase text-white border border-white/20">MENU</button>
            </div>
            <button onClick={shareScore} disabled={sharing} className="mt-4 w-full max-w-xl rounded-[28px] bg-[#8ec5ff]/15 border border-[#8ec5ff]/40 py-4 text-lg font-black uppercase text-[#8ec5ff] disabled:opacity-50 flex items-center justify-center gap-2">
              {sharing ? 'Generating…' : '📤 Share Score'}
            </button>
            {shareMsg && <p className="mt-3 text-sm font-bold text-white/70">{shareMsg}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Post-run reward flow: tap the floating gift, watch it shake into a
 * lottery-style burst, then reveal whatever the pool rolled — a MYTHIC
 * character card or a premium accessory. Rewards are banked the instant they
 * drop, so quitting mid-reveal never loses progress.
 */
export function UnboxingOverlay({ count, onDone }: { count: number; onDone: () => void }) {
  const { previewChest, applyChestDrop } = useActions()
  const [index, setIndex] = useState(0)
  const [stage, setStage] = useState<'idle' | 'watching' | 'shaking' | 'flash' | 'reveal' | 'claiming'>('idle')
  const [drop, setDrop] = useState<ChestDrop | null>(null)
  const [pending, setPending] = useState<ChestDrop | null>(null)
  const [claimed, setClaimed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [adError, setAdError] = useState<string | null>(null)
  const rolledFor = useRef(-1)
  const timers = useRef<number[]>([])

  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)) }, [])

  const startOpen = async () => {
    if (stage !== 'idle' || busy) return
    setBusy(true)
    setAdError(null)
    setStage('watching')
    const watched = await playRewardedAdSequence(2)
    if (!watched) {
      setAdError('Watch both ads to open this gift.')
      setStage('idle')
      setBusy(false)
      return
    }
    setStage('shaking')
    haptic([12, 30, 12, 40, 18])
    const t1 = window.setTimeout(() => {
      if (rolledFor.current !== index) {
        rolledFor.current = index
        const preview = previewChest()
        setPending(preview)
        setDrop(preview)
      }
      setStage('flash')
      haptic([40, 20, 80])
      sfx.unbox()
      const t2 = window.setTimeout(() => { setStage('reveal'); setBusy(false) }, 200)
      timers.current.push(t2)
    }, 1500)
    timers.current.push(t1)
  }

  const bank = async (doubled: boolean) => {
    if (!pending || claimed || busy) return
    if (doubled) {
      setBusy(true)
      const watched = await playRewardedAdSequence(2)
      if (!watched) {
        setAdError('Watch both ads to double the rewards.')
        setBusy(false)
        return
      }
    }
    const coins = pending.kind === 'ACCESSORY_CARD' && !pending.isNew ? pending.dupeCoins : 0
    const authorized = await authorizeDouble('chest', { coins, diamonds: 0 }, doubled)
    const copies = doubled && authorized.ok ? 2 : 1
    setDrop(applyChestDrop(pending, copies))
    setClaimed(true)
    setBusy(false)
    setAdError(null)
  }

  const advance = () => {
    if (!claimed) return
    if (index + 1 >= count) { onDone(); return }
    setIndex((i) => i + 1)
    setStage('idle')
    setDrop(null)
    setPending(null)
    setClaimed(false)
    setAdError(null)
  }

  const char = drop?.kind === 'CHARACTER_CARD' ? CHARACTERS.find((c) => c.id === drop.charId) : null
  const accessory = drop?.kind === 'ACCESSORY_CARD' ? cosmeticById(drop.accessoryId) : null

  // FREE-tier characters never drop from chests, but the map keeps the union total.
  const tierName: RevealTier = char ? (char.rarity === 'FREE' ? 'COMMON' : char.rarity) : accessory ? accessory.rarity : 'LEGENDARY'
  const tier = REVEAL_TIER[tierName]
  const confetti = useMemo(() => makeConfetti(tier.particles, tier.colors), [tier])

  const isLast = index + 1 >= count
  const pct = drop?.kind === 'CHARACTER_CARD' ? Math.round((drop.have / drop.need) * 100) : 0
  const bursting = stage === 'flash' || stage === 'reveal'

  return (
    <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0510]/96 backdrop-blur-xl p-6 overflow-hidden" onPointerDown={(e) => e.stopPropagation()}>
      <p className="text-[#ffd24d] font-black uppercase tracking-[0.3em] text-xs mb-1">Mythic Gift</p>
      <h2 className="text-3xl sm:text-4xl font-black text-white mb-6">
        {count > 1 ? `Gift ${index + 1} of ${count}` : 'A mythic gift awaits'}
      </h2>

      <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
        {stage === 'shaking' && <div className="gift-aura absolute h-40 w-40 rounded-full bg-[#FFD700]/35" />}
        {bursting && confetti.map((p, i) => (
          <span
            key={`cf-${index}-${i}`}
            className="confetti-burst absolute pointer-events-none"
            style={{
              ['--dx' as string]: `${p.dx}px`,
              ['--dy' as string]: `${p.dy}px`,
              ['--rot' as string]: `${p.rot}deg`,
              animationDelay: `${p.delay}ms`,
              width: p.size,
              height: p.size,
              color: p.color,
            }}
          >
            {p.star ? (
              <svg viewBox="0 0 12 12" width={p.size} height={p.size}><path d="M6 0 L7.4 4.2 L12 4.6 L8.4 7.6 L9.4 12 L6 9.6 L2.6 12 L3.6 7.6 L0 4.6 L4.6 4.2 Z" fill="currentColor" /></svg>
            ) : (
              <span className="block h-full w-full rounded-full" style={{ background: p.color }} />
            )}
          </span>
        ))}
        {stage !== 'reveal' && (
          <button
            type="button"
            onClick={startOpen}
            disabled={stage !== 'idle'}
            className={`relative z-10 h-40 w-40 rounded-full border-0 bg-transparent p-0 ${stage === 'idle' ? 'gift-idle cursor-pointer' : ''} ${stage === 'shaking' ? 'gift-shake-build' : ''} ${stage === 'flash' ? 'opacity-0' : ''}`}
            aria-label="Open mythic gift"
          >
            <GiftArt sparkle className="h-full w-full" />
          </button>
        )}
      </div>

      {stage === 'idle' && (
        <p className="mt-2 text-sm font-bold text-white/55 animate-pulse">Watch 2 ads to open this gift</p>
      )}
      {stage === 'watching' && (
        <p className="mt-2 text-sm font-bold text-[#ffd24d] animate-pulse">Playing rewarded ads…</p>
      )}
      {adError && <p className="mt-2 text-sm font-bold text-[#ff7ad9]">{adError}</p>}

      {drop && stage === 'reveal' ? (
        <div
          className="mythic-reveal relative w-full max-w-xs overflow-hidden rounded-[32px] border-2 bg-[#2a1c42] p-5 text-center"
          style={{ borderColor: tier.accent, boxShadow: `0 0 44px ${tier.aura}` }}
        >
          {tier.holo && <div className="holo-sweep pointer-events-none absolute inset-0" />}

          <span
            className="relative inline-block rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
            style={{ color: tier.accent, background: `${tier.accent}22` }}
          >
            {drop.kind === 'CHARACTER_CARD'
              ? drop.unlocked ? 'New Character!' : 'Character Card'
              : drop.isNew ? 'New Accessory!' : 'Duplicate'}
          </span>

          {/* the reveal uses the exact same premium asset as the customiser */}
          <div className="relative mx-auto my-3 h-24 w-24">
            {char && <CharacterView charId={char.id} className="h-24 w-24 drop-shadow-xl" />}
            {accessory && <AccessoryArt id={accessory.id} className="h-24 w-24 drop-shadow-xl" />}
          </div>

          <h3 className="relative text-white font-black text-base truncate">{char?.name ?? accessory?.name}</h3>
          <p className="relative mt-1 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: tier.accent }}>
            {tierName}
            {accessory && ` · ${TYPE_LABEL[accessory.type]}`}
          </p>

          {drop.kind === 'CHARACTER_CARD' && (
            <>
              <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, background: tier.accent }}
                />
              </div>
              <p className="relative mt-2 text-xs font-black uppercase tracking-wider text-white/60">
                Cards: {drop.have}/{drop.need}
              </p>
              {drop.unlocked && <p className="relative mt-3 text-sm font-black text-[#6ee7a8] animate-pulse">✨ UNLOCKED!</p>}
            </>
          )}

          {drop.kind === 'ACCESSORY_CARD' && (
            <p className="relative mt-3 text-sm font-black text-[#6ee7a8]">
              {drop.isNew ? '✨ Added to your inventory' : `Already owned · +${drop.dupeCoins} 🪙`}
            </p>
          )}
        </div>
      ) : stage !== 'idle' && stage !== 'reveal' ? (
        <p className="h-[72px] flex items-center text-white/50 font-bold">Something legendary is waking…</p>
      ) : (
        <div className="h-[72px]" />
      )}

      {drop && stage === 'reveal' && !claimed && (
        <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => { void bank(false) }}
            className="w-full rounded-[28px] bg-[#6ee7a8] py-4 text-lg font-black uppercase text-[#170d24] shadow-lg disabled:opacity-40"
          >
            Claim
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { void bank(true) }}
            className="w-full rounded-[28px] bg-[#ffd24d] py-4 text-lg font-black uppercase text-[#170d24] shadow-lg disabled:opacity-40"
          >
            {busy ? 'Please wait…' : 'Double Rewards (2 Ads)'}
          </button>
        </div>
      )}

      <button
        onClick={advance}
        disabled={stage !== 'reveal' || !claimed}
        className="mt-6 w-full max-w-xs rounded-[28px] bg-[#6ee7a8] py-4 text-lg font-black uppercase text-[#170d24] shadow-lg disabled:opacity-40"
      >
        {isLast ? 'Continue' : 'Next Gift'}
      </button>

      {stage === 'flash' && <div className="unbox-flash pointer-events-none absolute inset-0 z-[120] bg-white" />}
    </div>
  )
}
