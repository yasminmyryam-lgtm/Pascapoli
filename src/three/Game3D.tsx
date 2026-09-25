import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import * as THREE from 'three'
import type { CoopConfig } from '../coopConfig'
import { CHARACTERS } from '../characters'
import { OBSTACLES } from '../obstacles'
import { sfx } from '../sfx'
import { useActions, useGameState, type GameReward } from '../store'
import { playRewardedAdSequence } from '../ads/adService'
import { chargeReviveDiamonds, isAdRevive } from '../economy/economyApi'
import ReviveOffer from '../economy/ReviveOffer'
import { UnboxingOverlay } from '../Game'
import Scene3D, { aimCamera3, CAMERA3D } from './Scene3D'
import { useRunAssets } from './useRunAssets'
import { createWorld3, flap3, readSnap3, revive3, writeSnap3, W3, type Mode3D, type Snap3, type Tick3, type World3 } from './world3d'

function haptic(pattern: number | number[]) {
  try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern) } catch {}
}

/**
 * Isolated 3D match. Own world, own loop, own hit tests.
 * Never imports `Game.tsx`.
 */
export default function Game3D({
  mode,
  coopConfig,
  connection,
  onClose,
  onReplay,
}: {
  mode: 'NORMAL' | 'CHALLENGE' | 'COOP'
  coopConfig: CoopConfig
  connection: { open?: boolean; send: (m: unknown) => void; on: (e: string, fn: (d: unknown) => void) => void; off: (e: string, fn: (d: unknown) => void) => void } | null
  onClose: () => void
  onReplay: () => void
}) {
  const { obstacle, selected, equipped, diamonds } = useGameState()
  const { recordGame } = useActions()

  const isCoop = mode === 'COOP'
  const isHost = !isCoop || coopConfig.isHost
  const guest = isCoop && !isHost
  const simMode: Mode3D = mode === 'CHALLENGE' ? 'CHALLENGE' : mode === 'COOP' ? 'COOP' : 'NORMAL'
  const local: 1 | 2 = guest ? 2 : 1

  const env = OBSTACLES.find((o) => o.id === (isCoop ? coopConfig.hostBg || obstacle : obstacle)) ?? OBSTACLES[0]
  const mateId = isCoop
    ? (guest ? coopConfig.p1Char : coopConfig.p2Char)
    : selected
  const mateChar = (CHARACTERS.find((c) => c.id === mateId) ?? CHARACTERS[0]).id
  const { assets, error } = useRunAssets(env, mateChar, equipped[mateChar] ?? {})

  const worldRef = useRef<World3>(createWorld3(simMode, isCoop ? coopConfig.gameSeed || 1 : Date.now()))
  const [phase, setPhase] = useState<'playing' | 'unboxing' | 'over'>('playing')
  const [hud, setHud] = useState({ score: 0, coins: 0, chests: 0 })
  const [paused, setPaused] = useState(false)
  const [summary, setSummary] = useState<GameReward | null>(null)
  const [offerRevive, setOfferRevive] = useState(false)
  const [reviveBusy, setReviveBusy] = useState(false)
  const [reviveError, setReviveError] = useState<string | null>(null)
  const reviveCountRef = useRef(0)
  const [countLabel, setCountLabel] = useState<string | null>(isCoop ? '3' : null)
  const [waiting, setWaiting] = useState(!isCoop)
  const [sharing, setSharing] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)

  const activeRef = useRef(false)
  const pausedRef = useRef(false)
  const countdownRef = useRef(isCoop)
  const settledRef = useRef(false)
  const pitchRef = useRef(0)
  const drag = useRef<{ y: number; tilting: boolean } | null>(null)

  useEffect(() => {
    activeRef.current = Boolean(assets) && phase === 'playing' && !paused && !worldRef.current.over && !countdownRef.current && !offerRevive
  }, [assets, phase, paused, offerRevive])

  const settle = useCallback(() => {
    if (settledRef.current) return
    settledRef.current = true
    activeRef.current = false
    const w = worldRef.current
    w.over = true
    setWaiting(false)
    setOfferRevive(false)
    setHud({ score: w.score, coins: w.coinsGot, chests: w.chestsGot })
    setSummary(recordGame(w.score, w.coinsGot, mode))
    if (w.chestsGot > 0) setPhase('unboxing')
    else {
      setPhase('over')
      haptic([50, 40, 90])
      sfx.gameOver()
    }
  }, [recordGame, mode])

  const handleEvents = useCallback(
    (ev: Tick3) => {
      const w = worldRef.current
      if (ev.scored) sfx.score()
      if (ev.coins) {
        haptic(5)
        sfx.coin()
      }
      if (ev.chest) {
        haptic([12, 20, 12])
        sfx.chime()
      }
      if (ev.scored || ev.coins || ev.chest) {
        setHud({ score: w.score, coins: w.coinsGot, chests: w.chestsGot })
      }
      if (ev.died && !guest) {
        sfx.hit()
        haptic([30, 30, 60])
        if (isCoop && isHost) {
          try {
            connection?.send({ opCode: '3D_DOWNED', payload: { score: w.score, collected: w.coinsGot, chests: w.chestsGot } })
          } catch {}
        }
        setHud({ score: w.score, coins: w.coinsGot, chests: w.chestsGot })
        setReviveError(null)
        setOfferRevive(true)
      }
    },
    [guest, isCoop, isHost, connection],
  )

  const giveUp = useCallback(() => {
    if (settledRef.current) return
    const w = worldRef.current
    if (isCoop && isHost) {
      try {
        connection?.send({ opCode: '3D_OVER', payload: { score: w.score, collected: w.coinsGot, chests: w.chestsGot } })
      } catch {}
    }
    settle()
  }, [settle, isCoop, isHost, connection])

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
      revive3(worldRef.current)
      setOfferRevive(false)
      activeRef.current = true
      if (isCoop && isHost) {
        try { connection?.send({ opCode: '3D_REVIVE' }) } catch {}
      }
    } finally {
      setReviveBusy(false)
    }
  }, [reviveBusy, diamonds, isCoop, isHost, connection])

  const flap = useCallback(() => {
    if (phase !== 'playing' || pausedRef.current || worldRef.current.over || countdownRef.current || offerRevive) return
    haptic(8)
    sfx.flap()
    setWaiting(false)
    if (guest) {
      flap3(worldRef.current, 2)
      try { connection?.send({ opCode: '3D_FLAP' }) } catch {}
      return
    }
    flap3(worldRef.current, 1)
  }, [phase, guest, connection, offerRevive])

  useEffect(() => {
    if (!connection) return
    const onData = (packet: unknown) => {
      if (!packet || typeof packet !== 'object') return
      const msg = packet as { opCode?: string; snap?: Snap3; payload?: { score: number; collected: number; chests: number } }
      if (msg.opCode === '3D_FLAP' && isHost) {
        flap3(worldRef.current, 2)
        setWaiting(false)
      }
      if (msg.opCode === '3D_STATE' && guest && msg.snap) {
        readSnap3(worldRef.current, msg.snap)
        if (msg.snap.started) setWaiting(false)
        setHud({ score: msg.snap.sc, coins: msg.snap.cc, chests: msg.snap.kc })
      }
      if (msg.opCode === '3D_DOWNED' && guest && msg.payload) {
        worldRef.current.over = true
        worldRef.current.score = msg.payload.score
        worldRef.current.coinsGot = msg.payload.collected
        worldRef.current.chestsGot = msg.payload.chests
        setHud({ score: msg.payload.score, coins: msg.payload.collected, chests: msg.payload.chests })
        setOfferRevive(true)
      }
      if (msg.opCode === '3D_REVIVE' && guest) {
        revive3(worldRef.current)
        setOfferRevive(false)
        activeRef.current = true
      }
      if (msg.opCode === '3D_OVER' && guest && msg.payload) {
        worldRef.current.over = true
        activeRef.current = false
        worldRef.current.score = msg.payload.score
        worldRef.current.coinsGot = msg.payload.collected
        worldRef.current.chestsGot = msg.payload.chests
        settle()
      }
    }
    connection.on('data', onData)
    return () => {
      try { connection.off('data', onData) } catch {}
    }
  }, [connection, isHost, guest, settle])

  useEffect(() => {
    if (!isCoop || !isHost || !connection) return
    const id = window.setInterval(() => {
      if (worldRef.current.over || !connection.open) return
      try {
        connection.send({ opCode: '3D_STATE', snap: writeSnap3(worldRef.current) })
      } catch {}
    }, 50)
    return () => window.clearInterval(id)
  }, [isCoop, isHost, connection])

  useEffect(() => {
    if (!isCoop) return
    countdownRef.current = true
    let n = 3
    setCountLabel('3')
    const iv = window.setInterval(() => {
      n -= 1
      if (n > 0) setCountLabel(String(n))
      else if (n === 0) {
        setCountLabel('GO!')
        sfx.score()
      } else {
        setCountLabel(null)
        countdownRef.current = false
        setWaiting(true)
        window.clearInterval(iv)
      }
    }, 700)
    return () => window.clearInterval(iv)
  }, [isCoop])

  useEffect(() => {
    const held = { up: false, down: false }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (e.type === 'keydown' && !e.repeat) flap()
      }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        held.up = e.type === 'keydown'
        if (e.type === 'keydown' && !e.repeat) pitchRef.current = Math.min(0.75, pitchRef.current + 0.12)
      }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        held.down = e.type === 'keydown'
        if (e.type === 'keydown' && !e.repeat) pitchRef.current = Math.max(-0.75, pitchRef.current - 0.12)
      }
    }
    const tick = window.setInterval(() => {
      if (held.up) pitchRef.current = Math.min(0.75, pitchRef.current + 0.045)
      if (held.down) pitchRef.current = Math.max(-0.75, pitchRef.current - 0.045)
    }, 16)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [flap])

  useEffect(() => {
    const onVis = () => {
      const hidden = document.visibilityState === 'hidden'
      pausedRef.current = hidden
      setPaused(hidden)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const shareScore = async () => {
    if (sharing) return
    setSharing(true)
    setShareMsg(null)
    const text = `I scored ${hud.score} in Pastaoli 3D!`
    try {
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
      if (nav.share) {
        await nav.share({ title: 'Pastaoli', text })
        setShareMsg('Shared!')
      } else {
        await navigator.clipboard.writeText(text)
        setShareMsg('Copied to clipboard')
      }
    } catch {
      setShareMsg('Share cancelled')
    } finally {
      setSharing(false)
    }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY, tilting: false }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const dy = d.y - e.clientY
    if (Math.abs(dy) > 10) d.tilting = true
    if (d.tilting) {
      pitchRef.current = Math.max(-0.7, Math.min(0.7, pitchRef.current + dy * 0.006))
      d.y = e.clientY
    }
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (d && !d.tilting) flap()
  }

  const spawnLane = isCoop ? (local === 1 ? -W3.LANE : W3.LANE) : 0

  return (
    <div className="fixed inset-0 z-[999] bg-black font-display flex items-center justify-center selection:bg-transparent">
      <div
        className="relative h-full w-full overflow-hidden"
        style={{ background: env.backgroundStyle, touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTapHighlightColor: 'transparent' }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {env.Background && <env.Background />}

        {assets && (
          <Canvas
            dpr={[1, 1.25]}
            gl={{
              alpha: true,
              antialias: false,
              powerPreference: 'high-performance',
              toneMapping: THREE.NoToneMapping,
            }}
            camera={{ fov: CAMERA3D.fov, near: CAMERA3D.near, far: CAMERA3D.far, position: [spawnLane, W3.START_Y, 0.22] }}
            onCreated={({ camera }) => aimCamera3(camera, spawnLane, W3.START_Y, 0)}
            style={{ position: 'absolute', inset: 0 }}
          >
            <Scene3D
              world={worldRef.current}
              assets={assets}
              local={local}
              coop={isCoop}
              pitchRef={pitchRef}
              activeRef={activeRef}
              simulate={!guest}
              onEvents={handleEvents}
            />
          </Canvas>
        )}

        <div className="absolute z-40 flex justify-between items-start pointer-events-none" style={{ top: 'max(2rem, env(safe-area-inset-top))', left: 'max(2rem, env(safe-area-inset-left))', right: 'max(2rem, env(safe-area-inset-right))' }}>
          <div className="flex gap-2">
            <div className="bg-[#170d24]/90 border border-white/10 px-6 py-3 rounded-2xl"><span className="text-2xl font-black text-[#ffe6a3]">🪙 {hud.coins}</span></div>
            <div className="bg-[#170d24]/90 border border-white/10 px-6 py-3 rounded-2xl"><span className="text-2xl font-black text-[#ffd24d]">🎁 {hud.chests}</span></div>
          </div>
          <div className="text-8xl font-black text-white drop-shadow-lg">{hud.score}</div>
        </div>

        {countLabel && (
          <div className="absolute inset-0 z-[90] grid place-items-center pointer-events-none">
            <p className="text-8xl font-black text-white drop-shadow-xl">{countLabel}</p>
          </div>
        )}

        {waiting && phase === 'playing' && !countLabel && assets && (
          <div className="absolute inset-0 z-[88] grid place-items-center pointer-events-none">
            <p className="text-4xl font-black text-white drop-shadow-xl animate-pulse">TAP TO START</p>
          </div>
        )}

        {!assets && !error && (
          <div className="absolute inset-0 z-[90] grid place-items-center bg-black/40">
            <p className="text-2xl font-black text-white animate-pulse">Building 3D world…</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-[95] flex flex-col items-center justify-center gap-4 bg-black/80 p-6" onPointerDown={(e) => e.stopPropagation()}>
            <p className="text-2xl font-black text-white text-center">{error}</p>
            <button onClick={onClose} className="rounded-[28px] bg-white/10 px-8 py-4 font-black uppercase text-white border border-white/20">Back to menu</button>
          </div>
        )}

        {paused && phase === 'playing' && !offerRevive && (
          <div className="absolute inset-0 z-[95] grid place-items-center bg-black/70">
            <p className="text-5xl font-black text-white">⏸ PAUSED</p>
          </div>
        )}

        {offerRevive && phase === 'playing' && (
          <div className="game-over-slide absolute inset-0 z-[100] bg-[#0a0510]/95 backdrop-blur-xl flex flex-col items-center justify-center p-6" onPointerDown={(e) => e.stopPropagation()}>
            <h2 className="text-6xl font-black text-white mb-2 drop-shadow-xl text-center">{isCoop ? 'TEAM DOWN' : 'GAME OVER'}</h2>
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl mb-6">
              <div className="flex-1 bg-[#2a1c42] p-5 rounded-3xl text-center"><p className="text-[#8ec5ff] uppercase font-black text-xs mb-1">Score</p><p className="text-4xl font-black text-white">{hud.score}</p></div>
              <div className="flex-1 bg-[#241a33] p-5 rounded-3xl text-center"><p className="text-white/50 uppercase font-black text-xs mb-1">Collected</p><p className="text-4xl font-black text-white/90">{hud.coins}</p></div>
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
            count={hud.chests}
            onDone={() => { setPhase('over'); sfx.gameOver() }}
          />
        )}

        {phase === 'over' && (
          <div className="game-over-slide absolute inset-0 z-[100] bg-[#0a0510]/95 backdrop-blur-xl flex flex-col items-center justify-center p-6" onPointerDown={(e) => e.stopPropagation()}>
            <h2 className="text-6xl font-black text-white mb-2 drop-shadow-xl text-center">{isCoop ? 'TEAM OVER' : 'GAME OVER'}</h2>
            {summary?.isNewBest && <p className="mb-6 text-xl font-black text-[#ffd24d] animate-pulse">🏆 NEW RECORD!</p>}
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl mb-6">
              <div className="flex-1 bg-[#2a1c42] p-5 rounded-3xl text-center"><p className="text-[#8ec5ff] uppercase font-black text-xs mb-1">Score</p><p className="text-4xl font-black text-white">{hud.score}</p></div>
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
