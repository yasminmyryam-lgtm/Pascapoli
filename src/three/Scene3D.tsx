import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { W3, step3, type World3, type Coin3, type Tick3 } from './world3d'
import type { RunAssets } from './useRunAssets'

export const CAMERA3D = { fov: 68, near: 0.12, far: 140 } as const
export const CAM_Z = 0.22

const PIPE_POOL = 7
const COIN_POOL = 10
const CHEST_POOL = 3
const SEG = 12
const CAP_RADIUS = W3.PIPE_RADIUS * 1.18
const FACE_W = CAP_RADIUS * 2
const FACE_H = FACE_W * (44 / 120)
const LOOK_DIST = 14

type Props = {
  world: World3
  assets: RunAssets
  /** Local player is 1 (solo/host) or 2 (guest). */
  local: 1 | 2
  coop: boolean
  /** Extra pitch in radians. Visual only. */
  pitchRef: { current: number }
  activeRef: { current: boolean }
  /** Host / solo step the 3D world. Guest only renders snapshots. */
  simulate: boolean
  onEvents: (events: Tick3) => void
}

/** Sit on the track and look straight down −Z at the pipe corridor. */
export function aimCamera3(camera: THREE.Camera, x: number, y: number, pitch: number) {
  camera.position.set(x, y, CAM_Z)
  camera.up.set(0, 1, 0)
  camera.lookAt(x, y + Math.sin(pitch) * LOOK_DIST, -Math.cos(pitch) * LOOK_DIST)
}

export default function Scene3D({
  world,
  assets,
  local,
  coop,
  pitchRef,
  activeRef,
  simulate,
  onEvents,
}: Props) {
  const camera = useThree((s) => s.camera)
  const onEventsRef = useRef(onEvents)
  onEventsRef.current = onEvents

  const laneXs = coop ? ([-W3.LANE, W3.LANE] as const) : ([0] as const)

  const scene = useMemo(() => {
    const root = new THREE.Group()
    const trash: { dispose: () => void }[] = []
    const keep = <T extends { dispose: () => void }>(x: T) => {
      trash.push(x)
      return x
    }

    const shaftGeo = keep(new THREE.CylinderGeometry(W3.PIPE_RADIUS, W3.PIPE_RADIUS, 1, SEG, 1, true))
    const capGeo = keep(new THREE.CylinderGeometry(CAP_RADIUS, CAP_RADIUS, 0.32, SEG))
    const faceGeo = keep(new THREE.PlaneGeometry(FACE_W, FACE_H))
    const badgeGeo = keep(new THREE.PlaneGeometry(0.38, 0.38))
    const coinGeo = keep(new THREE.PlaneGeometry(0.42, 0.42))
    const giftGeo = keep(new THREE.PlaneGeometry(0.62, 0.62))
    const bodyGeo = keep(new THREE.PlaneGeometry(0.95, 0.95))
    const cityGeo = keep(new THREE.BoxGeometry(1, 1, 1))

    const makeLane = () => {
      const shaftMat = keep(new THREE.MeshLambertMaterial({ map: assets.shaft }))
      const capMat = keep(new THREE.MeshLambertMaterial({ color: assets.capEndColor }))
      const faceMat = keep(
        new THREE.MeshLambertMaterial({
          map: assets.capFace,
          transparent: true,
          depthWrite: true,
        }),
      )
      const badgeMat = keep(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
      const g = new THREE.Group()
      const top = new THREE.Mesh(shaftGeo, shaftMat)
      const bot = new THREE.Mesh(shaftGeo, shaftMat)
      const topCap = new THREE.Mesh(capGeo, capMat)
      const botCap = new THREE.Mesh(capGeo, capMat)
      const topFace = new THREE.Mesh(faceGeo, faceMat)
      const botFace = new THREE.Mesh(faceGeo, faceMat)
      topFace.position.z = CAP_RADIUS + 0.018
      botFace.position.z = CAP_RADIUS + 0.018
      const badge = new THREE.Mesh(badgeGeo, badgeMat)
      badge.position.z = W3.PIPE_RADIUS + 0.03
      for (const m of [top, bot, topCap, botCap]) g.add(m)
      g.add(topFace, botFace, badge)
      g.visible = false
      root.add(g)
      return { g, top, bot, topCap, botCap, topFace, botFace, badge, badgeMat, badgeN: -1 }
    }

    const pipes = Array.from({ length: PIPE_POOL }, () => ({
      lanes: [makeLane(), makeLane()] as [ReturnType<typeof makeLane>, ReturnType<typeof makeLane>],
    }))

    const coins = Array.from({ length: COIN_POOL }, () => {
      const mat = keep(
        new THREE.MeshBasicMaterial({
          map: assets.coin,
          transparent: true,
          alphaTest: 0.05,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      )
      const mesh = new THREE.Mesh(coinGeo, mat)
      mesh.visible = false
      root.add(mesh)
      return { mesh, mat }
    })

    const chests = Array.from({ length: CHEST_POOL }, () => {
      const mat = keep(new THREE.MeshBasicMaterial({ map: assets.gift, transparent: true, alphaTest: 0.05, depthWrite: false }))
      const mesh = new THREE.Mesh(giftGeo, mat)
      mesh.visible = false
      root.add(mesh)
      return { mesh, mat }
    })

    const mateMat = keep(
      new THREE.MeshBasicMaterial({
        map: assets.character,
        transparent: true,
        alphaTest: 0.04,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    )
    const mate = new THREE.Mesh(bodyGeo, mateMat)
    mate.visible = false
    mate.renderOrder = 2
    root.add(mate)

    const groundTex = keep(makeGround(assets.groundColors))
    groundTex.repeat.set(1, 80)
    const ground = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(36, 160)),
      keep(new THREE.MeshLambertMaterial({ map: groundTex })),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, 0, -50)
    root.add(ground)

    const cityMat = keep(
      new THREE.MeshLambertMaterial({
        color: assets.groundColors[1].clone().lerp(new THREE.Color('#1a1430'), 0.45),
      }),
    )
    const city = new THREE.Group()
    for (let i = 0; i < 8; i += 1) {
      const h = 1.4 + ((i * 13) % 5) * 0.45
      const box = new THREE.Mesh(cityGeo, cityMat)
      box.scale.set(0.9, h, 0.6)
      box.position.set((i - 3.5) * 1.6, h / 2, -88)
      city.add(box)
    }
    root.add(city)

    return { root, pipes, coins, chests, mate, groundTex, dispose: () => trash.forEach((t) => t.dispose()) }
  }, [assets])

  const badges = useRef(new Map<number, THREE.CanvasTexture>())

  useEffect(() => () => {
    scene.dispose()
    badges.current.forEach((tex) => tex.dispose())
    badges.current.clear()
  }, [scene])

  useLayoutEffect(() => {
    const myY = local === 1 ? world.y1 : world.y2
    const myLane = coop ? (local === 1 ? -W3.LANE : W3.LANE) : 0
    aimCamera3(camera, myLane, myY, pitchRef.current)
  }, [camera, coop, local, world, pitchRef])

  const looted = useRef(new WeakMap<Coin3, number>())

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.033)
    const time = state.clock.elapsedTime

    const myY = local === 1 ? world.y1 : world.y2
    const otherY = local === 1 ? world.y2 : world.y1
    const myLane = coop ? (local === 1 ? -W3.LANE : W3.LANE) : 0
    const otherLane = -myLane

    aimCamera3(camera, myLane, myY, pitchRef.current)

    if (simulate && activeRef.current && !world.over) {
      const ev = step3(world, dt, coop)
      if (ev.scored || ev.coins || ev.chest || ev.died) onEventsRef.current(ev)
    }

    if (world.started && !world.over) scene.groundTex.offset.y += dt * 1.8

    for (let i = 0; i < PIPE_POOL; i += 1) {
      const p = world.pipes[i]
      const slot = scene.pipes[i]
      const copies = coop ? 2 : 1
      if (!p) {
        slot.lanes[0].g.visible = false
        slot.lanes[1].g.visible = false
        continue
      }
      const topH = Math.max(W3.CEILING + 6 - (p.gapY + p.gap / 2), 0.2)
      const botH = Math.max(p.gapY - p.gap / 2, 0.2)
      for (let L = 0; L < 2; L += 1) {
        const lane = slot.lanes[L]
        if (L >= copies) {
          lane.g.visible = false
          continue
        }
        lane.g.visible = true
        lane.g.position.set(laneXs[L] ?? 0, 0, p.z)
        lane.top.scale.y = topH
        lane.top.position.y = p.gapY + p.gap / 2 + topH / 2
        lane.topCap.position.y = p.gapY + p.gap / 2
        lane.topFace.position.y = lane.topCap.position.y
        lane.bot.scale.y = botH
        lane.bot.position.y = (p.gapY - p.gap / 2) / 2
        lane.botCap.position.y = p.gapY - p.gap / 2
        lane.botFace.position.y = lane.botCap.position.y
        lane.badge.position.y = p.gapY + p.gap / 2 + 0.85
        if (lane.badgeN !== p.n) {
          lane.badgeN = p.n
          let tex = badges.current.get(p.n)
          if (!tex) {
            tex = makeBadge(p.n)
            badges.current.set(p.n, tex)
          }
          lane.badgeMat.map = tex
        }
      }
    }

    scene.coins.forEach((slot, i) => {
      const c = world.coins[i]
      if (!c) {
        slot.mesh.visible = false
        return
      }
      if (c.taken && !looted.current.has(c)) looted.current.set(c, time)
      const age = c.taken ? time - (looted.current.get(c) ?? time) : 0
      const pop = c.taken ? Math.min(age / 0.2, 1) : 0
      slot.mesh.visible = pop < 1
      if (!slot.mesh.visible) return
      slot.mesh.position.set(myLane, c.y, c.z)
      slot.mesh.quaternion.copy(camera.quaternion)
      slot.mesh.scale.setScalar(1 + pop * 0.7)
      slot.mat.opacity = 1 - pop
    })

    scene.chests.forEach((slot, i) => {
      const k = world.chests[i]
      if (!k || k.taken) {
        slot.mesh.visible = false
        return
      }
      slot.mesh.visible = true
      slot.mesh.position.set(myLane, k.y + Math.sin(time * 2.2) * 0.08, k.z)
      slot.mesh.quaternion.copy(camera.quaternion)
    })

    // Own body is never drawn. Co-op shows only the teammate, same Z, offset on X.
    scene.mate.visible = coop && !world.over
    if (scene.mate.visible) {
      scene.mate.position.set(otherLane, otherY, CAM_Z)
      scene.mate.quaternion.copy(camera.quaternion)
    }
  })

  return (
    <>
      <hemisphereLight args={['#f3fbff', '#c9b89a', 0.85]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[-2, 7, 4]} intensity={0.55} />
      <primitive object={scene.root} />
    </>
  )
}

function makeGround([a, b]: [THREE.Color, THREE.Color]) {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 32
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `#${a.getHexString()}`
  ctx.fillRect(0, 0, 4, 16)
  ctx.fillStyle = `#${b.getHexString()}`
  ctx.fillRect(0, 16, 4, 16)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.NearestFilter
  return tex
}

function makeBadge(n: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.roundRect(6, 6, 52, 52, 12)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#111'
  ctx.font = '900 28px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(n), 32, 34)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
