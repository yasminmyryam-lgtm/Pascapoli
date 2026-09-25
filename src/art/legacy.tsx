import { Shadow, makeAnchors, type BodyFn, type CharacterAnchors } from './kit'

/**
 * The original "Pastapoli" cast — glossy 3D-toy food characters. Artwork is
 * unchanged; it has only been re-homed from standalone `<svg>` marks into
 * `BodyFn`s so the composite renderer can drop them into the shared layered
 * SVG alongside accessory layers.
 */

/* Shared bits ------------------------------------------------------------- */

function Eyes({ cx1, cx2, cy, r = 8, look = 0 }: { cx1: number; cx2: number; cy: number; r?: number; look?: number }) {
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

function Blush({ cy = 66, dx = 24 }: { cy?: number; dx?: number }) {
  return (
    <g fill="#ff8fb3" opacity="0.65">
      <ellipse cx={60 - dx} cy={cy} rx="6" ry="4" />
      <ellipse cx={60 + dx} cy={cy} rx="6" ry="4" />
    </g>
  )
}

function Mouth({ cx = 60, cy, w = 11, frown = false, color = '#2a1a2e', sw = 2 }: { cx?: number; cy: number; w?: number; frown?: boolean; color?: string; sw?: number }) {
  const h = w / 2
  const d = frown
    ? `M${cx - h} ${cy + 2.4} Q${cx} ${cy - 3} ${cx + h} ${cy + 2.4}`
    : `M${cx - h} ${cy - 2.4} Q${cx} ${cy + 3.4} ${cx + h} ${cy - 2.4}`
  return <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
}

/* 1. Mozzarella Tarantella ------------------------------------------------ */
const BallerinaMozzarella: BodyFn = () => (
  <g>
    <defs>
      <radialGradient id="bm-body" cx="38%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="70%" stopColor="#fbf3e4" />
        <stop offset="100%" stopColor="#e9d9be" />
      </radialGradient>
      <radialGradient id="bm-tutu" cx="50%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#ffd7ea" />
        <stop offset="100%" stopColor="#ff9dc6" />
      </radialGradient>
    </defs>
    <Shadow />
    {/* shoes + ribbons */}
    <g stroke="#e56a97" strokeWidth="2" strokeLinecap="round">
      <path d="M50 112 l-3 -8 M52 112 l1 -8" />
      <path d="M70 112 l3 -8 M68 112 l-1 -8" />
    </g>
    <ellipse cx="49" cy="114" rx="8" ry="4.5" fill="#ff9dc6" />
    <ellipse cx="71" cy="114" rx="8" ry="4.5" fill="#ff9dc6" />
    {/* tutu */}
    <path d="M28 88 Q60 78 92 88 Q78 104 60 100 Q42 104 28 88 Z" fill="url(#bm-tutu)" />
    <path d="M30 88 Q60 82 90 88" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
    {/* body */}
    <ellipse cx="60" cy="56" rx="34" ry="35" fill="url(#bm-body)" />
    <ellipse cx="46" cy="40" rx="12" ry="9" fill="#fff" opacity="0.55" />
    <Eyes cx1={50} cx2={70} cy={54} r={8} />
    <path d="M53 70 Q60 76 67 70" fill="none" stroke="#c98b57" strokeWidth="2.4" strokeLinecap="round" />
    <Blush cy={64} dx={22} />
  </g>
)

/* 2. Macchiato Mascherato ------------------------------------------------- */
const EspressinoBandito: BodyFn = () => (
  <g>
    <defs>
      <linearGradient id="eb-cup" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fefefe" />
        <stop offset="100%" stopColor="#d7dbe0" />
      </linearGradient>
      <radialGradient id="eb-cof" cx="45%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#7a4326" />
        <stop offset="100%" stopColor="#3d2013" />
      </radialGradient>
    </defs>
    <Shadow />
    {/* hat */}
    <g>
      <ellipse cx="60" cy="30" rx="30" ry="6" fill="#3a2f4a" />
      <path d="M40 30 Q42 8 60 8 Q78 8 80 30 Z" fill="#4a3c60" />
      <rect x="40" y="26" width="40" height="5" rx="2" fill="#a06be0" />
    </g>
    {/* cup */}
    <path d="M34 44 L86 44 L80 108 Q60 116 40 108 Z" fill="url(#eb-cup)" />
    <ellipse cx="60" cy="44" rx="26" ry="7" fill="url(#eb-cof)" />
    <ellipse cx="53" cy="42" rx="7" ry="2.2" fill="#a4693f" opacity="0.7" />
    {/* handle */}
    <path d="M84 58 q16 4 8 24 q-4 8 -12 4" fill="none" stroke="#cfd4da" strokeWidth="6" strokeLinecap="round" />
    {/* bandit mask */}
    <path d="M40 60 Q60 52 80 60 L78 72 Q60 78 42 72 Z" fill="#2a2233" />
    <Eyes cx1={51} cx2={69} cy={66} r={6.5} />
    <path d="M52 88 Q60 93 68 88" fill="none" stroke="#3d2013" strokeWidth="2.2" strokeLinecap="round" />
    <Blush cy={82} dx={18} />
  </g>
)

/* 3. Panino Bambino ------------------------------------------------------- */
const PaninoCriminale: BodyFn = () => (
  <g>
    <defs>
      <linearGradient id="pc-bun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f6c877" />
        <stop offset="100%" stopColor="#d99a44" />
      </linearGradient>
    </defs>
    <Shadow />
    {/* top bun */}
    <path d="M22 58 Q60 22 98 58 Z" fill="url(#pc-bun)" />
    <g fill="#fff8ea" opacity="0.85">
      <circle cx="45" cy="46" r="1.6" />
      <circle cx="60" cy="40" r="1.6" />
      <circle cx="75" cy="46" r="1.6" />
      <circle cx="52" cy="52" r="1.4" />
      <circle cx="68" cy="52" r="1.4" />
    </g>
    {/* lettuce */}
    <path d="M20 58 q8 8 16 0 q8 8 16 0 q8 8 16 0 q8 8 16 0 q6 4 8 0 L100 66 L20 66 Z" fill="#7fc36a" />
    {/* cheese */}
    <path d="M22 66 L98 66 L108 78 L88 78 L96 88 L74 82 L82 92 L22 88 Z" fill="#ffcf3d" />
    {/* tomato */}
    <rect x="24" y="82" width="72" height="7" rx="3" fill="#f0533a" />
    {/* bottom bun */}
    <path d="M22 88 Q60 106 98 88 L98 94 Q60 112 22 94 Z" fill="url(#pc-bun)" />
    {/* dramatic face on top bun */}
    <Eyes cx1={50} cx2={70} cy={46} r={7} look={2} />
    <path d="M42 38 Q50 34 57 38 M63 38 Q70 34 78 38" fill="none" stroke="#8a5a1e" strokeWidth="2" strokeLinecap="round" />
    {/* moustache */}
    <path d="M52 56 Q56 60 60 57 Q64 60 68 56 Q64 53 60 55 Q56 53 52 56 Z" fill="#3a2410" />
  </g>
)

/* 4. Limoncello Monello --------------------------------------------------- */
const LimoneLunatico: BodyFn = () => (
  <g>
    <defs>
      <radialGradient id="ll-body" cx="36%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#fff5a0" />
        <stop offset="65%" stopColor="#ffe23d" />
        <stop offset="100%" stopColor="#e8a800" />
      </radialGradient>
    </defs>
    <Shadow />
    {/* leaf + stem */}
    <path d="M60 22 q2 -8 -2 -12 M60 20 q10 -4 16 -12 q-12 -2 -18 8 Z" fill="#5fae4a" stroke="#3f8a34" strokeWidth="1.5" />
    {/* body with nubs */}
    <ellipse cx="60" cy="66" rx="38" ry="34" fill="url(#ll-body)" />
    <ellipse cx="22" cy="66" rx="5" ry="6" fill="#e8a800" />
    <ellipse cx="98" cy="66" rx="5" ry="6" fill="#e8a800" />
    <ellipse cx="44" cy="46" rx="12" ry="8" fill="#fff" opacity="0.5" />
    {/* huge googly eyes */}
    <Eyes cx1={48} cx2={72} cy={60} r={13} look={4} />
    {/* mischievous grin */}
    <path d="M44 82 Q60 98 78 80 Q66 90 54 88 Q48 87 44 82 Z" fill="#7a4a00" />
    <path d="M50 84 q10 4 20 0" fill="none" stroke="#fff" strokeWidth="2" />
    <Blush cy={78} dx={26} />
  </g>
)

/* 5. Pizzetta Vendetta ---------------------------------------------------- */
const PizzarinoVolante: BodyFn = () => (
  <g>
    <defs>
      <linearGradient id="pv-crust" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f4c56b" />
        <stop offset="100%" stopColor="#c98a34" />
      </linearGradient>
      <linearGradient id="pv-cheese" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffdf7a" />
        <stop offset="100%" stopColor="#f2b23c" />
      </linearGradient>
    </defs>
    <Shadow />
    {/* wings */}
    <g>
      <path d="M28 58 Q4 44 6 66 Q4 84 28 74 Z" fill="#fff" stroke="#e6d9ff" strokeWidth="1.5" />
      <path d="M92 58 Q116 44 114 66 Q116 84 92 74 Z" fill="#fff" stroke="#e6d9ff" strokeWidth="1.5" />
    </g>
    {/* slice */}
    <path d="M60 24 L96 100 Q60 112 24 100 Z" fill="url(#pv-cheese)" />
    <path d="M24 100 Q60 112 96 100 L100 106 Q60 120 20 106 Z" fill="url(#pv-crust)" />
    {/* pepperoni */}
    <circle cx="52" cy="70" r="6" fill="#d34a3f" />
    <circle cx="72" cy="80" r="6" fill="#d34a3f" />
    <circle cx="58" cy="92" r="5" fill="#d34a3f" />
    {/* basil */}
    <ellipse cx="66" cy="60" rx="4" ry="2.4" fill="#4f9c3f" transform="rotate(30 66 60)" />
    <Eyes cx1={53} cx2={69} cy={58} r={7} look={2} />
    <path d="M54 74 Q61 82 68 73" fill="none" stroke="#7a3a20" strokeWidth="2.4" strokeLinecap="round" />
  </g>
)

/* 6. Spaghetto Fantasma --------------------------------------------------- */
const SpaghettoFantasma: BodyFn = () => (
  <g>
    <defs>
      <radialGradient id="sf-body" cx="45%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#fffdf5" />
        <stop offset="100%" stopColor="#f3e6c8" />
      </radialGradient>
    </defs>
    <ellipse cx="60" cy="123" rx="24" ry="5" fill="#000" opacity="0.15" />
    {/* ghost body */}
    <path
      d="M30 62 Q30 26 60 26 Q90 26 90 62 L90 100 Q84 94 78 100 Q72 106 66 100 Q60 94 54 100 Q48 106 42 100 Q36 94 30 100 Z"
      fill="url(#sf-body)"
      opacity="0.94"
    />
    {/* spaghetti strands overlay */}
    <g stroke="#e9d39c" strokeWidth="2" fill="none" opacity="0.8" strokeLinecap="round">
      <path d="M38 40 q6 20 2 54" />
      <path d="M50 34 q4 26 4 62" />
      <path d="M62 33 q-2 28 0 64" />
      <path d="M74 38 q-4 22 0 56" />
    </g>
    {/* stray noodle antenna */}
    <path d="M60 26 q0 -10 10 -14" stroke="#f3e6c8" strokeWidth="3" fill="none" strokeLinecap="round" />
    <circle cx="70" cy="12" r="3" fill="#f3e6c8" />
    <Eyes cx1={50} cx2={70} cy={58} r={8} />
    <ellipse cx="60" cy="76" rx="6" ry="8" fill="#7a6a3e" />
    <Blush cy={70} dx={20} />
  </g>
)

export const LEGACY_BODIES: Record<string, BodyFn> = {
  mozzarella: BallerinaMozzarella,
  espressino: EspressinoBandito,
  panino: PaninoCriminale,
  limone: LimoneLunatico,
  pizzarino: PizzarinoVolante,
  spaghetto: SpaghettoFantasma,
}

/**
 * Anchor points measured against each mark above. Characters that already wear
 * a hat (Macchiato) place `head` above their own headwear so an equipped hat
 * stacks instead of colliding.
 */
export const LEGACY_ANCHORS: Record<string, CharacterAnchors> = {
  mozzarella: makeAnchors({
    head: { x: 60, y: 22, scale: 1.1 },
    face: { x: 60, y: 54, scale: 1.05 },
    body: { x: 60, y: 92, scale: 1.05 },
    chest: { x: 60, y: 82 },
    back: { x: 60, y: 60 },
    feet: { x: 60, y: 114 },
  }),
  espressino: makeAnchors({
    head: { x: 60, y: 8, scale: 0.95 },
    face: { x: 60, y: 66, scale: 0.9 },
    body: { x: 60, y: 88, scale: 0.95 },
    chest: { x: 60, y: 78 },
    back: { x: 60, y: 72 },
    feet: { x: 60, y: 110 },
  }),
  panino: makeAnchors({
    head: { x: 60, y: 26, scale: 1.2 },
    face: { x: 60, y: 46, scale: 0.95 },
    body: { x: 60, y: 78, scale: 1.15 },
    chest: { x: 60, y: 66 },
    back: { x: 60, y: 72 },
    feet: { x: 60, y: 100 },
  }),
  limone: makeAnchors({
    head: { x: 60, y: 31, scale: 1.15 },
    face: { x: 60, y: 60, scale: 1.3 },
    body: { x: 60, y: 92, scale: 1.1 },
    chest: { x: 60, y: 84 },
    back: { x: 60, y: 66 },
    feet: { x: 60, y: 112 },
  }),
  pizzarino: makeAnchors({
    head: { x: 60, y: 28, scale: 0.85 },
    face: { x: 60, y: 58, scale: 0.9 },
    body: { x: 60, y: 88 },
    chest: { x: 60, y: 78 },
    back: { x: 60, y: 70 },
    feet: { x: 60, y: 110 },
  }),
  spaghetto: makeAnchors({
    head: { x: 60, y: 27, scale: 1.05 },
    face: { x: 60, y: 58, scale: 1.05 },
    body: { x: 60, y: 88 },
    chest: { x: 60, y: 78 },
    back: { x: 60, y: 66 },
    feet: { x: 60, y: 104 },
  }),
}
