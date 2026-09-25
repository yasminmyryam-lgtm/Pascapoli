import React, { CSSProperties, JSX } from 'react'

export type PieceProps = { className?: string; style?: CSSProperties; flip?: boolean }

export type Obstacle = {
  id: string; name: string; tag: string; swatch: string; unlockLevel: number; price: number; currency: 'COINS' | 'DIAMONDS';
  backgroundStyle: string;
  Background?: () => JSX.Element;
  /** The vertical shaft. Designed to be stretched to any height (preserveAspectRatio="none"). */
  Piece: (p: PieceProps) => JSX.Element;
  /** The fixed-height lip drawn at the gap edge, so it never distorts. */
  Cap: (p: PieceProps) => JSX.Element;
}

type Palette = { body: string; light: string; dark: string; stroke: string; cap: string; accent?: string }

/**
 * SHAFT — fills the ENTIRE 100×100 viewBox so its on-screen width matches
 * PHYSICS.PIPE_WIDTH exactly. Rendered as a fluted Italian column / breadstick:
 * ONLY vertical strips are used, so stretching it vertically
 * (preserveAspectRatio="none") keeps every flute crisp at any height.
 */
function makeShaft(pal: Palette) {
  return function Shaft({ className, style }: PieceProps) {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} style={style}>
        <rect x="0" y="0" width="100" height="100" fill={pal.body} />
        {/* Fluted column grooves — evenly spaced vertical ridges (reads as breadstick/pillar) */}
        {[18, 34, 50, 66, 82].map((cx) => (
          <g key={cx}>
            <rect x={cx - 5} y="0" width="6" height="100" fill={pal.light} opacity="0.4" />
            <rect x={cx + 1} y="0" width="3" height="100" fill={pal.dark} opacity="0.35" />
          </g>
        ))}
        {/* Rounded left highlight + right shadow for a cylindrical column feel */}
        <rect x="0" y="0" width="12" height="100" fill={pal.light} opacity="0.6" />
        <rect x="82" y="0" width="18" height="100" fill={pal.dark} opacity="0.45" />
        <rect x="0" y="0" width="3.5" height="100" fill={pal.stroke} opacity="0.65" />
        <rect x="96.5" y="0" width="3.5" height="100" fill={pal.stroke} opacity="0.65" />
      </svg>
    )
  }
}

function CuteFace() {
  return (
    <g>
      <ellipse cx="46" cy="20" rx="7" ry="9" fill="#fff" />
      <circle cx="48" cy="21" r="3.4" fill="#123" />
      <circle cx="46" cy="18" r="1.6" fill="#fff" />
      <ellipse cx="74" cy="20" rx="7" ry="9" fill="#fff" />
      <circle cx="76" cy="21" r="3.4" fill="#123" />
      <circle cx="74" cy="18" r="1.6" fill="#fff" />
      <ellipse cx="34" cy="27" rx="4.5" ry="2.8" fill="#ff7ad9" opacity="0.6" />
      <ellipse cx="86" cy="27" rx="4.5" ry="2.8" fill="#ff7ad9" opacity="0.6" />
      <path d="M52 29 Q60 39 68 29" fill="none" stroke="#123" strokeWidth="3.2" strokeLinecap="round" />
    </g>
  )
}

/**
 * CAP — drawn at a FIXED pixel height at the gap opening. A little wider than
 * the shaft for a classic pipe lip. The cute face lives here so it never squishes.
 */
function makeCap(pal: Palette, extra?: JSX.Element) {
  return function Cap({ className, style }: PieceProps) {
    return (
      <svg viewBox="0 0 120 44" preserveAspectRatio="xMidYMid meet" className={className} style={style}>
        {/* Tiered pillar capital — a slim base tier + a wide crown lip */}
        <rect x="14" y="0" width="92" height="12" rx="4" fill={pal.body} stroke={pal.stroke} strokeWidth="2.5" />
        <rect x="2" y="10" width="116" height="30" rx="11" fill={pal.cap} stroke={pal.stroke} strokeWidth="3" />
        <rect x="8" y="15" width="20" height="20" rx="6" fill={pal.light} opacity="0.5" />
        <rect x="2" y="34" width="116" height="6" rx="3" fill={pal.dark} opacity="0.4" />
        {extra}
        <CuteFace />
      </svg>
    )
  }
}

export const OBSTACLES: Obstacle[] = [
  {
    id: 'woodo', name: 'Woodo Bambino', tag: 'Classic', swatch: '#c9944f', unlockLevel: 1, price: 0, currency: 'COINS',
    backgroundStyle: 'linear-gradient(180deg, #8ed6ff 0%, #bfe9ff 40%, #eafaff 100%)',
    Piece: makeShaft({ body: '#d9a45f', light: '#ecc188', dark: '#a9752f', stroke: '#8a5a2e', cap: '#cf9a52' }),
    Cap: makeCap({ body: '#d9a45f', light: '#ecc188', dark: '#a9752f', stroke: '#8a5a2e', cap: '#cf9a52' }),
  },
  {
    id: 'mozza', name: 'Mozza Towers', tag: 'Cheese', swatch: '#fffaf0', unlockLevel: 3, price: 1500, currency: 'COINS',
    backgroundStyle: 'linear-gradient(180deg, #ffb8ec 0%, #ffe6f5 60%, #ffffff 100%)',
    Piece: makeShaft({ body: '#fffaf0', light: '#ffffff', dark: '#e6d7b8', stroke: '#ccb88e', cap: '#fff6e4' }),
    Cap: makeCap({ body: '#fffaf0', light: '#ffffff', dark: '#e6d7b8', stroke: '#ccb88e', cap: '#fff6e4' },
      <g fill="#e6d7b8" opacity="0.6"><circle cx="24" cy="30" r="3" /><circle cx="96" cy="14" r="2.4" /></g>),
  },
  {
    id: 'pasta', name: 'Pasta Pipes', tag: 'Gold', swatch: '#e2b54c', unlockLevel: 6, price: 5000, currency: 'COINS',
    backgroundStyle: 'linear-gradient(180deg, #ffe082 0%, #fff8d6 50%, #ffffff 100%)',
    Background: () => <div className="absolute inset-0 pointer-events-none opacity-40" style={{ backgroundImage: 'radial-gradient(#e2b54c 4px, transparent 4px)', backgroundSize: '50px 50px' }}></div>,
    Piece: makeShaft({ body: '#f6dd97', light: '#ffeeb0', dark: '#d3ac54', stroke: '#c99a34', cap: '#f0cf6f' }),
    Cap: makeCap({ body: '#f6dd97', light: '#ffeeb0', dark: '#d3ac54', stroke: '#c99a34', cap: '#f0cf6f' }),
  },
  {
    id: 'espresso', name: 'Espresso Night', tag: 'Night', swatch: '#ffffff', unlockLevel: 10, price: 15, currency: 'DIAMONDS',
    backgroundStyle: 'linear-gradient(180deg, #0b0710 0%, #1a0d2e 50%, #2d1245 100%)',
    Background: () => (
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {Array.from({ length: 40 }).map((_, i) => <circle key={i} cx={`${(Math.sin(i * 17) * 50) + 50}%`} cy={`${(Math.cos(i * 23) * 50) + 50}%`} r={((i * 7) % 3) + 1} fill={i % 2 === 0 ? '#ff7ad9' : '#8ec5ff'} opacity={0.3 + ((i * 13) % 6) / 10} />)}
      </svg>
    ),
    Piece: makeShaft({ body: '#ffffff', light: '#ffffff', dark: '#c9ccd2', stroke: '#747a85', cap: '#eef0f3' }),
    Cap: makeCap({ body: '#ffffff', light: '#ffffff', dark: '#c9ccd2', stroke: '#747a85', cap: '#eef0f3' },
      <rect x="6" y="6" width="108" height="7" rx="3" fill="#3d2013" />),
  },
  {
    id: 'candy', name: 'Candy Sunset', tag: 'Sweet', swatch: '#ff9ec4', unlockLevel: 4, price: 3200, currency: 'COINS',
    backgroundStyle: 'linear-gradient(180deg, #ff9a9e 0%, #fecfef 55%, #fff0f6 100%)',
    Piece: makeShaft({ body: '#ff9ec4', light: '#ffd0e4', dark: '#e06a9d', stroke: '#c14e82', cap: '#ffb3d4' }),
    Cap: makeCap({ body: '#ff9ec4', light: '#ffd0e4', dark: '#e06a9d', stroke: '#c14e82', cap: '#ffb3d4' },
      <g fill="#fff" opacity="0.6"><circle cx="22" cy="14" r="2.6" /><circle cx="98" cy="30" r="2" /></g>),
  },
  {
    id: 'neon', name: 'Neon Galaxy', tag: 'Premium', swatch: '#b98bff', unlockLevel: 8, price: 30, currency: 'DIAMONDS',
    backgroundStyle: 'linear-gradient(180deg, #05010f 0%, #1b0740 45%, #3a0f6b 100%)',
    Background: () => (
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {Array.from({ length: 46 }).map((_, i) => <circle key={i} cx={`${(Math.sin(i * 12.9) * 50) + 50}%`} cy={`${(Math.cos(i * 7.3) * 50) + 50}%`} r={((i * 5) % 3) + 1} fill={['#8ec5ff', '#ff7ad9', '#6ee7a8'][i % 3]} opacity={0.25 + ((i * 11) % 7) / 12} />)}
      </svg>
    ),
    Piece: makeShaft({ body: '#7a3cff', light: '#b98bff', dark: '#4a1fae', stroke: '#2a0f6b', cap: '#8f52ff' }),
    Cap: makeCap({ body: '#7a3cff', light: '#b98bff', dark: '#4a1fae', stroke: '#2a0f6b', cap: '#8f52ff' },
      <g fill="#8ec5ff"><circle cx="20" cy="12" r="1.8" /><circle cx="100" cy="16" r="1.6" /><circle cx="60" cy="8" r="2" /></g>),
  },
]
