/**
 * Isolated 3D run. `Game.tsx` never imports this file.
 */

export type Mode3D = 'NORMAL' | 'CHALLENGE' | 'COOP'

export const W3 = {
  GRAVITY: 16,
  FLAP: 6.8,
  TERMINAL: 12,
  BASE_SPEED: 10,
  HARD_SPEED: 14,
  PIPE_SPACING: 16,
  PIPE_RADIUS: 0.55,
  GAP_BASE: 3.6,
  GAP_HARD: 3.0,
  GAP_MIN: 2.2,
  HIT_RADIUS: 0.32,
  COIN_RADIUS: 0.75,
  CHEST_RADIUS: 0.95,
  CEILING: 7.4,
  FLOOR: 0.45,
  LANE: 1.15,
  START_Y: 3.2,
  FIRST_Z: -11,
  CHEST_MIN: 20,
  CHEST_MAX: 30,
} as const

export type Pipe3 = { z: number; gapY: number; gap: number; scored: boolean; n: number }
export type Coin3 = { z: number; y: number; taken: boolean }
export type Chest3 = { z: number; y: number; taken: boolean }

export type World3 = {
  mode: Mode3D
  rng: () => number
  y1: number
  y2: number
  v1: number
  v2: number
  pipes: Pipe3[]
  coins: Coin3[]
  chests: Chest3[]
  spawned: number
  nextChest: number
  score: number
  coinsGot: number
  chestsGot: number
  over: boolean
  /** False until the first flap — camera sits on the track, nothing moves. */
  started: boolean
  /** Seconds of post-revive invulnerability. */
  iframes: number
}

export type Tick3 = {
  scored: number
  coins: number
  chest: boolean
  died: boolean
}

/** Compact host → guest snapshot. 3D-only; never shared with Game.tsx. */
export type Snap3 = {
  y1: number
  y2: number
  v1: number
  v2: number
  sc: number
  cc: number
  kc: number
  started: boolean
  pipes: { z: number; gy: number; g: number; n: number; s: boolean }[]
  coins: { z: number; y: number; t: boolean }[]
  chests: { z: number; y: number; t: boolean }[]
}

export function writeSnap3(world: World3): Snap3 {
  return {
    y1: world.y1,
    y2: world.y2,
    v1: world.v1,
    v2: world.v2,
    sc: world.score,
    cc: world.coinsGot,
    kc: world.chestsGot,
    started: world.started,
    pipes: world.pipes.map((p) => ({ z: p.z, gy: p.gapY, g: p.gap, n: p.n, s: p.scored })),
    coins: world.coins.map((c) => ({ z: c.z, y: c.y, t: c.taken })),
    chests: world.chests.map((k) => ({ z: k.z, y: k.y, t: k.taken })),
  }
}

export function readSnap3(world: World3, snap: Snap3) {
  world.y1 = snap.y1
  world.y2 = snap.y2
  world.v1 = snap.v1
  world.v2 = snap.v2
  world.score = snap.sc
  world.coinsGot = snap.cc
  world.chestsGot = snap.kc
  world.started = snap.started
  world.pipes = snap.pipes.map((p) => ({ z: p.z, gapY: p.gy, gap: p.g, n: p.n, scored: p.s }))
  world.coins = snap.coins.map((c) => ({ z: c.z, y: c.y, taken: c.t }))
  world.chests = snap.chests.map((k) => ({ z: k.z, y: k.y, taken: k.t }))
}

function rngFrom(seed: number) {
  return function () {
    seed = Math.imul(1664525, seed) + 1013904223
    return (seed >>> 0) / 4294967296
  }
}

function speedOf(world: World3) {
  const base = world.mode === 'CHALLENGE' ? W3.HARD_SPEED : W3.BASE_SPEED
  return base * (1 + Math.min(world.score * 0.016, 0.9))
}

function gapOf(world: World3) {
  const base = world.mode === 'CHALLENGE' ? W3.GAP_HARD : W3.GAP_BASE
  return Math.max(W3.GAP_MIN, base - Math.min(world.score * 0.035, base - W3.GAP_MIN))
}

function spawnPipe(world: World3, z: number, gapY?: number) {
  const gap = gapOf(world)
  const mid = gapY ?? W3.FLOOR + 1.4 + world.rng() * (W3.CEILING - W3.FLOOR - 2.8)
  world.spawned += 1
  world.pipes.push({ z, gapY: mid, gap, scored: false, n: world.spawned })
  world.coins.push({ z: z - W3.PIPE_SPACING * 0.4, y: mid, taken: false })
  if (world.mode === 'CHALLENGE') {
    world.coins.push({ z: z - W3.PIPE_SPACING * 0.4 - 1.1, y: mid + 0.65, taken: false })
  }
  if (world.nextChest === 0) {
    world.nextChest = W3.CHEST_MIN + Math.floor(world.rng() * (W3.CHEST_MAX - W3.CHEST_MIN + 1))
  }
  if (world.spawned === world.nextChest) {
    world.chests.push({ z: z - W3.PIPE_SPACING * 0.2, y: mid, taken: false })
    world.nextChest += W3.CHEST_MIN + Math.floor(world.rng() * (W3.CHEST_MAX - W3.CHEST_MIN + 1))
  }
}

export function createWorld3(mode: Mode3D, seed = (Date.now() >>> 0) || 1): World3 {
  const world: World3 = {
    mode,
    rng: rngFrom(seed),
    y1: W3.START_Y,
    y2: W3.START_Y,
    v1: 0,
    v2: 0,
    pipes: [],
    coins: [],
    chests: [],
    spawned: 0,
    nextChest: 0,
    score: 0,
    coinsGot: 0,
    chestsGot: 0,
    over: false,
    started: false,
    iframes: 0,
  }
  // First pipe is locked to the start height so the camera opens on the gap.
  spawnPipe(world, W3.FIRST_Z, W3.START_Y)
  for (let i = 1; i < 6; i += 1) spawnPipe(world, W3.FIRST_Z - i * W3.PIPE_SPACING)
  return world
}

export function flap3(world: World3, who: 1 | 2) {
  if (world.over) return
  world.started = true
  if (who === 1) world.v1 = W3.FLAP
  else world.v2 = W3.FLAP
}

/** Resume a downed run: lift into the nearest gap and grant a short i-frame. */
export function revive3(world: World3) {
  const pipe = world.pipes.find((p) => Math.abs(p.z) < 4) ?? world.pipes[0]
  const y = pipe ? pipe.gapY : W3.START_Y
  world.over = false
  world.started = true
  world.iframes = 2
  world.y1 = y
  world.v1 = W3.FLAP
  world.y2 = y
  world.v2 = W3.FLAP
}

/** True if the player's sphere overlaps a pipe shaft this frame (swept on Z). */
export function hitsPipeBox(y: number, pipe: Pipe3, prevZ: number, nowZ: number) {
  const pad = W3.PIPE_RADIUS + W3.HIT_RADIUS
  const zMin = Math.min(prevZ, nowZ)
  const zMax = Math.max(prevZ, nowZ)
  if (zMax < -pad || zMin > pad) return false
  const gapTop = pipe.gapY + pipe.gap / 2
  const gapBot = pipe.gapY - pipe.gap / 2
  return y + W3.HIT_RADIUS > gapTop || y - W3.HIT_RADIUS < gapBot
}

export function step3(world: World3, dt: number, coop: boolean): Tick3 {
  const ev: Tick3 = { scored: 0, coins: 0, chest: false, died: false }
  if (world.over || !world.started) return ev

  const dz = speedOf(world) * dt
  const prevZ = new Map(world.pipes.map((p) => [p, p.z]))

  world.v1 = Math.max(world.v1 - W3.GRAVITY * dt, -W3.TERMINAL)
  world.y1 += world.v1 * dt
  if (coop) {
    world.v2 = Math.max(world.v2 - W3.GRAVITY * dt, -W3.TERMINAL)
    world.y2 += world.v2 * dt
  }

  for (const p of world.pipes) p.z += dz
  for (const c of world.coins) c.z += dz
  for (const k of world.chests) k.z += dz

  const last = world.pipes[world.pipes.length - 1]
  if (!last || last.z > -W3.PIPE_SPACING * 4) {
    spawnPipe(world, (last?.z ?? W3.FIRST_Z) - W3.PIPE_SPACING)
  }

  world.pipes = world.pipes.filter((p) => p.z < 6)
  world.coins = world.coins.filter((c) => c.z < 6)
  world.chests = world.chests.filter((k) => k.z < 6)

  for (const p of world.pipes) {
    if (!p.scored && p.z > 0.35) {
      p.scored = true
      world.score += 1
      ev.scored += 1
    }
  }

  const collect = (y: number) => {
    for (const c of world.coins) {
      if (c.taken) continue
      const dy = y - c.y
      const dzc = -c.z
      if (dy * dy + dzc * dzc < W3.COIN_RADIUS * W3.COIN_RADIUS) {
        c.taken = true
        ev.coins += 1
      }
    }
    for (const k of world.chests) {
      if (k.taken) continue
      const dy = y - k.y
      const dzc = -k.z
      if (dy * dy + dzc * dzc < W3.CHEST_RADIUS * W3.CHEST_RADIUS) {
        k.taken = true
        ev.chest = true
      }
    }
  }
  collect(world.y1)
  if (coop) collect(world.y2)
  world.coinsGot += ev.coins
  if (ev.chest) world.chestsGot += 1

  const out = (y: number) => y > W3.CEILING - W3.HIT_RADIUS || y < W3.FLOOR + W3.HIT_RADIUS
  let hit = out(world.y1) || (coop && out(world.y2))

  for (const p of world.pipes) {
    const before = prevZ.get(p) ?? p.z - dz
    if (hitsPipeBox(world.y1, p, before, p.z)) hit = true
    if (coop && hitsPipeBox(world.y2, p, before, p.z)) hit = true
  }

  if (world.iframes > 0) {
    world.iframes = Math.max(0, world.iframes - dt)
    hit = false
  }

  if (hit) {
    world.over = true
    ev.died = true
  }
  return ev
}
