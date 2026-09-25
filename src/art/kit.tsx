import type { CSSProperties, JSX, ReactNode } from 'react'

/**
 * IMMUTABLE ART COORDINATE SYSTEM
 * ================================
 * Every character and every accessory is presented in this exact coordinate
 * space. It never changes at runtime — not when an accessory is equipped, not
 * when the viewport resizes, not when the shop opens.
 *
 * Authoring happens in a 120×132 drawing pad (the original mascot grid). That
 * pad is then placed, UNIFORM-SCALED, into a 256×256 presentation viewBox so
 * CSS boxes can stay square without letterboxing the sprite. The character
 * group itself is never given a transform: accessories absorb every fit.
 *
 * Visual overflow is fitted by `art/fit.ts` in CharacterComposite so hats
 * and large bodies cannot grow the sprite. Gameplay hitboxes never read this.
 */
export const ART_W = 256
export const ART_H = 256
export const ART_VIEW_BOX = `0 0 ${ART_W} ${ART_H}`

/** Authoring pad used by every BodyFn, accessory and anchor. */
export const DRAW_W = 120
export const DRAW_H = 132

/** Uniform scale that maps the 120×132 pad onto the 256-tall canvas. */
export const ART_SCALE = ART_H / DRAW_H
export const ART_OX = (ART_W - DRAW_W * ART_SCALE) / 2
export const ART_CONTENT_TRANSFORM = `translate(${ART_OX} 0) scale(${ART_SCALE})`

export type ArtProps = { className?: string; style?: CSSProperties }

/**
 * A character's artwork, authored as the *inner* SVG content only (no `<svg>`
 * wrapper). Returning a fragment lets the composite renderer drop the base art
 * into one shared `<svg>` alongside the accessory layers, so a single
 * rasterisation covers the whole mark.
 */
export type BodyFn = () => JSX.Element

/** Wraps a body function into a standalone character component. */
export function toArt(id: string, Body: BodyFn) {
  return function Art({ className, style }: ArtProps) {
    return (
      <Svg id={id} className={className} style={style}>
        <g id="character-base">{Body()}</g>
      </Svg>
    )
  }
}

/** Where an accessory attaches. Each character supplies its own coordinates. */
export type AnchorName = 'head' | 'face' | 'body' | 'chest' | 'back' | 'feet'

export type Anchor = {
  x: number
  y: number
  /** Multiplier applied to the accessory only. Never applied to the character. */
  scale: number
  rotation: number
}

export type CharacterAnchors = Record<AnchorName, Anchor>

/**
 * Neutral anchors for a mid-sized character. Individual characters override
 * whichever anchors their silhouette needs (tall cones, big ears, horns…).
 */
export const DEFAULT_ANCHORS: CharacterAnchors = {
  head: { x: 60, y: 30, scale: 1, rotation: 0 },
  face: { x: 60, y: 62, scale: 1, rotation: 0 },
  body: { x: 60, y: 96, scale: 1, rotation: 0 },
  chest: { x: 60, y: 88, scale: 1, rotation: 0 },
  back: { x: 60, y: 74, scale: 1, rotation: 0 },
  feet: { x: 60, y: 118, scale: 1, rotation: 0 },
}

export function makeAnchors(overrides: Partial<Record<AnchorName, Partial<Anchor>>>): CharacterAnchors {
  const out = {} as CharacterAnchors
  for (const key of Object.keys(DEFAULT_ANCHORS) as AnchorName[]) {
    out[key] = { ...DEFAULT_ANCHORS[key], ...(overrides[key] ?? {}) }
  }
  return out
}

/**
 * Root wrapper for one character mark.
 *
 * `overflow: visible` is deliberate — an accessory rendered above y=0 must be
 * able to spill out instead of forcing the character to shrink to fit.
 */
export function Svg({
  id,
  className,
  style,
  children,
}: {
  id: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <svg
      viewBox={ART_VIEW_BOX}
      preserveAspectRatio="xMidYMid meet"
      overflow="visible"
      className={className}
      style={{ overflow: 'visible', ...style }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={id}
    >
      <g transform={ART_CONTENT_TRANSFORM}>{children}</g>
    </svg>
  )
}

/** Soft elliptical contact shadow on the ground plane. */
export function Shadow({ cx = 60, cy = 123, rx = 30, ry = 6, opacity = 0.22 }: { cx?: number; cy?: number; rx?: number; ry?: number; opacity?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#000" opacity={opacity} />
}

/** Shared mascot face: two dark eyes, white specular, tiny smile. */
export function MascotFace({
  cx = 60,
  cy = 56,
  gap = 11,
  r = 5,
  mouth = true,
  eye = '#1A1A1A',
}: {
  cx?: number
  cy?: number
  gap?: number
  r?: number
  mouth?: boolean
  eye?: string
}) {
  const hl = r * 0.32
  return (
    <g>
      <circle cx={cx - gap} cy={cy} r={r} fill={eye} />
      <circle cx={cx + gap} cy={cy} r={r} fill={eye} />
      <circle cx={cx - gap - r * 0.28} cy={cy - r * 0.32} r={hl} fill="#FFFFFF" />
      <circle cx={cx + gap - r * 0.28} cy={cy - r * 0.32} r={hl} fill="#FFFFFF" />
      {mouth && (
        <path
          d={`M${cx - 5} ${cy + 12} Q ${cx} ${cy + 17} ${cx + 5} ${cy + 12}`}
          fill="none"
          stroke="#1A1A1A"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </g>
  )
}

export function StubLegs({ y = 108, color, dx = 14 }: { y?: number; color: string; dx?: number }) {
  return (
    <g>
      <rect x={60 - dx - 6} y={y} width="12" height="16" rx="10" fill={color} />
      <rect x={60 + dx - 6} y={y} width="12" height="16" rx="10" fill={color} />
    </g>
  )
}

export function StubArms({ y = 78, color, dx = 34 }: { y?: number; color: string; dx?: number }) {
  return (
    <g>
      <rect x={60 - dx - 5} y={y} width="14" height="8" rx="10" fill={color} />
      <rect x={60 + dx - 9} y={y} width="14" height="8" rx="10" fill={color} />
    </g>
  )
}

export function FourStar({ cx, cy, r, fill = '#FFD700' }: { cx: number; cy: number; r: number; fill?: string }) {
  return (
    <polygon
      fill={fill}
      points={`${cx},${cy - r} ${cx + r * 0.28},${cy - r * 0.28} ${cx + r},${cy} ${cx + r * 0.28},${cy + r * 0.28} ${cx},${cy + r} ${cx - r * 0.28},${cy + r * 0.28} ${cx - r},${cy} ${cx - r * 0.28},${cy - r * 0.28}`}
    />
  )
}

/**
 * Original Pastapoli face: white googly sclera, dark pupil, top-left sparkle.
 * This is the DNA of Mozzarella / Limoncello / Spaghetto — use it when a
 * character must look like it came from that same designer.
 */
export function GooglyEyes({
  cx1,
  cx2,
  cy,
  r = 8,
  look = 0,
}: {
  cx1: number
  cx2: number
  cy: number
  r?: number
  look?: number
}) {
  const pr = r * 0.55
  return (
    <g>
      <ellipse cx={cx1} cy={cy} rx={r} ry={r * 1.08} fill="#fff" />
      <ellipse cx={cx2} cy={cy} rx={r} ry={r * 1.08} fill="#fff" />
      <circle cx={cx1 + look} cy={cy + 1} r={pr} fill="#2a1a2e" />
      <circle cx={cx2 + look} cy={cy + 1} r={pr} fill="#2a1a2e" />
      <circle cx={cx1 + look - pr * 0.4} cy={cy + 1 - pr * 0.4} r={pr * 0.4} fill="#fff" />
      <circle cx={cx2 + look - pr * 0.4} cy={cy + 1 - pr * 0.4} r={pr * 0.4} fill="#fff" />
    </g>
  )
}

export function SoftBlush({ cy = 66, dx = 24 }: { cy?: number; dx?: number }) {
  return (
    <g fill="#ff8fb3" opacity="0.65">
      <ellipse cx={60 - dx} cy={cy} rx="6" ry="4" />
      <ellipse cx={60 + dx} cy={cy} rx="6" ry="4" />
    </g>
  )
}

export function Smile({
  cx = 60,
  cy,
  w = 11,
  frown = false,
  color = '#2a1a2e',
  sw = 2,
}: {
  cx?: number
  cy: number
  w?: number
  frown?: boolean
  color?: string
  sw?: number
}) {
  const h = w / 2
  const d = frown
    ? `M${cx - h} ${cy + 2.4} Q${cx} ${cy - 3} ${cx + h} ${cy + 2.4}`
    : `M${cx - h} ${cy - 2.4} Q${cx} ${cy + 3.4} ${cx + h} ${cy - 2.4}`
  return <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
}

/* --- Premium kawaii face system ----------------------------------------
   Eyes are glossy #1A1A1A with a large top-left reflection and a small
   bottom-right one, matching the global 45° top-left key light. Expression
   varies per character so personalities read differently.                */

export type Expression =
  | 'happy'
  | 'confident'
  | 'mischievous'
  | 'elegant'
  | 'angry'
  | 'mysterious'
  | 'proud'
  | 'sleepy'
  | 'dramatic'

/** One glossy kawaii eye with the two mandatory specular reflections. */
export function Eye({ cx, cy, r = 5, color = '#1A1A1A' }: { cx: number; cy: number; r?: number; color?: string }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.12} fill={color} />
      <circle cx={cx - r * 0.34} cy={cy - r * 0.42} r={r * 0.38} fill="#FFFFFF" opacity="0.95" />
      <circle cx={cx + r * 0.36} cy={cy + r * 0.44} r={r * 0.17} fill="#FFFFFF" opacity="0.8" />
    </g>
  )
}

/** Soft radial blush. `uid` keeps the gradient id unique across the document. */
export function Blush({ uid, cx, cy, r = 5.5, color = '#FF8A8A' }: { uid: string; cx: number; cy: number; r?: number; color?: string }) {
  const gid = `${uid}-blush`
  return (
    <g>
      <defs>
        <radialGradient id={gid} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.85" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${gid})`} />
    </g>
  )
}

function mouthPath(cx: number, cy: number, s: number, expression: Expression): string {
  const w = 5.4 * s
  switch (expression) {
    case 'confident':
    case 'mischievous':
      // asymmetric smirk
      return `M${cx - w} ${cy + 1.4 * s} Q ${cx + 0.6 * s} ${cy + 6 * s} ${cx + w} ${cy - 1.2 * s}`
    case 'angry':
      return `M${cx - w} ${cy + 5 * s} Q ${cx} ${cy - 0.4 * s} ${cx + w} ${cy + 5 * s}`
    case 'elegant':
    case 'mysterious':
      return `M${cx - w * 0.8} ${cy + 2.4 * s} Q ${cx} ${cy + 5 * s} ${cx + w * 0.8} ${cy + 2.4 * s}`
    case 'sleepy':
      return `M${cx - w * 0.6} ${cy + 3 * s} Q ${cx} ${cy + 5.6 * s} ${cx + w * 0.6} ${cy + 3 * s}`
    case 'dramatic':
    case 'proud':
      return `M${cx - w * 0.7} ${cy + 2 * s} Q ${cx} ${cy + 7.4 * s} ${cx + w * 0.7} ${cy + 2 * s}`
    default:
      return `M${cx - w} ${cy + 1.8 * s} Q ${cx} ${cy + 7.2 * s} ${cx + w} ${cy + 1.8 * s}`
  }
}

/**
 * Complete kawaii face: two glossy eyes, optional brows, radial blush and an
 * expression-specific mouth. `uid` must be unique per character.
 */
export function Face({
  uid,
  cx = 60,
  cy = 62,
  s = 1,
  gap = 11,
  eyeR = 5,
  expression = 'happy',
  eyeColor = '#1A1A1A',
  blush = true,
  blushColor = '#FF8A8A',
  mouthColor = '#1A1A1A',
  browColor,
}: {
  uid: string
  cx?: number
  cy?: number
  s?: number
  gap?: number
  eyeR?: number
  expression?: Expression
  eyeColor?: string
  blush?: boolean
  blushColor?: string
  mouthColor?: string
  browColor?: string
}) {
  const g = gap * s
  const r = eyeR * s
  const lidded = expression === 'mysterious' || expression === 'sleepy' || expression === 'elegant'
  const brows = browColor ?? (expression === 'angry' || expression === 'proud' || expression === 'dramatic' ? '#1A1A1A' : undefined)

  return (
    <g>
      {blush && (
        <>
          <Blush uid={`${uid}-l`} cx={cx - g - 4.4 * s} cy={cy + 5.4 * s} r={5.6 * s} color={blushColor} />
          <Blush uid={`${uid}-r`} cx={cx + g + 4.4 * s} cy={cy + 5.4 * s} r={5.6 * s} color={blushColor} />
        </>
      )}
      <Eye cx={cx - g} cy={cy} r={r} color={eyeColor} />
      <Eye cx={cx + g} cy={cy} r={r} color={eyeColor} />
      {lidded && (
        <g fill="none" stroke={eyeColor} strokeWidth={1.7 * s} strokeLinecap="round">
          <path d={`M${cx - g - r * 1.1} ${cy - r * 0.5} Q ${cx - g} ${cy - r * 1.5} ${cx - g + r * 1.1} ${cy - r * 0.5}`} />
          <path d={`M${cx + g - r * 1.1} ${cy - r * 0.5} Q ${cx + g} ${cy - r * 1.5} ${cx + g + r * 1.1} ${cy - r * 0.5}`} />
        </g>
      )}
      {brows && (
        <g stroke={brows} strokeWidth={2.1 * s} strokeLinecap="round">
          <path d={`M${cx - g - r * 1.2} ${cy - r * 2.1} L${cx - g + r * 0.9} ${cy - r * 1.3}`} />
          <path d={`M${cx + g + r * 1.2} ${cy - r * 2.1} L${cx + g - r * 0.9} ${cy - r * 1.3}`} />
        </g>
      )}
      <path d={mouthPath(cx, cy, s, expression)} fill="none" stroke={mouthColor} strokeWidth={1.9 * s} strokeLinecap="round" />
    </g>
  )
}

/** Flat 5-point star for sparkle accents. */
export function Star({ cx, cy, r, fill = '#FFD700', opacity = 1 }: { cx: number; cy: number; r: number; fill?: string; opacity?: number }) {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.44
    const a = (Math.PI / 5) * i - Math.PI / 2
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)}`)
  }
  return <path d={`M${pts.join(' L')} Z`} fill={fill} opacity={opacity} />
}

/** Sharp geometric edible gold-leaf flake. */
export function GoldFlake({ cx, cy, s = 3, rot = 0, fill = '#FFD700' }: { cx: number; cy: number; s?: number; rot?: number; fill?: string }) {
  return (
    <path
      d={`M${cx} ${cy - s} L${cx + s * 0.68} ${cy} L${cx} ${cy + s} L${cx - s * 0.68} ${cy} Z`}
      fill={fill}
      transform={`rotate(${rot} ${cx} ${cy})`}
    />
  )
}

/** Epic/Legendary gold glow — painted in the SVG, never via CSS (hitboxes stay put). */
export function PremiumGlow({ uid, color = '#FFD700' }: { uid: string; color?: string }) {
  return (
    <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="2.6" floodColor={color} floodOpacity="0.85" />
    </filter>
  )
}

export function Sparkles({ color = '#FFD700' }: { color?: string }) {
  return (
    <g>
      <Star cx={12} cy={26} r={3.2} fill={color} />
      <Star cx={108} cy={22} r={2.8} fill={color} />
      <Star cx={112} cy={90} r={2.2} fill="#ffffff" opacity={0.9} />
      <Star cx={14} cy={98} r={2} fill={color} opacity={0.85} />
    </g>
  )
}

/** Mythic backdrop: holographic wash + soft aura. */
export function MythicAura({ uid }: { uid: string }) {
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}-aura`} cx="50%" cy="42%" r="58%">
          <stop offset="0%" stopColor="#ffe27a" stopOpacity="0.5" />
          <stop offset="50%" stopColor="#b98bff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#7cf3ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-holo`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7cf3ff" />
          <stop offset="35%" stopColor="#c9b6ff" />
          <stop offset="70%" stopColor="#ff7ad9" />
          <stop offset="100%" stopColor="#ffe27a" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="68" rx="54" ry="54" fill={`url(#${uid}-aura)`} />
    </g>
  )
}

export type { JSX }
