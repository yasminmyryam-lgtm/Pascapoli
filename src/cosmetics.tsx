import { useLayoutEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { anchorsFor, bodyFor } from './characters'
import { fitCacheKey, fitScaleFromBBox, fitTransform, peekFitScale, rememberFitScale } from './art/fit'
import { ART_CONTENT_TRANSFORM, ART_SCALE, ART_VIEW_BOX, DEFAULT_ANCHORS, type AnchorName, type CharacterAnchors } from './art/kit'
import { isFounder, useGameState } from './store'

/**
 * ACCESSORY SYSTEM
 * ================
 * Accessories are independent SVG layers composited onto the character
 * (see `art/kit.tsx`). They may be authored in either space:
 *
 *   - `viewbox` — native 256×256 presentation coordinates, never scaled
 *   - `pad`     — legacy 120×132 authoring grid
 *
 * Visual fit: the whole composite (body + accessories) is uniformly scaled
 * down around the body pivot so it stays inside the standard 256×256 box.
 * That scale is presentation-only — `Game.tsx` PHYSICS never reads it.
 */

export type CosmeticRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC'

/** Cosmetic categories. One accessory of each `Slot` can be worn at a time. */
export type Slot = 'hat' | 'glasses' | 'wig' | 'shoes' | 'outfit' | 'accessory' | 'face' | 'wings' | 'aura'

export type AccessoryType = 'HAT' | 'COSTUME' | 'GLASSES' | 'FACE' | 'WIG' | 'SHOES' | 'ACCESSORY' | 'SKIN'

/** Paint layers, in back-to-front order. Mirrors the group ids in the output SVG. */
export type LayerId =
  | 'background-effects'
  | 'back-accessories'
  | 'body-accessories'
  | 'face-accessories'
  | 'head-accessories'
  | 'front-effects'

export type Cosmetic = {
  id: string
  name: string
  slot: Slot
  type: AccessoryType
  rarity: CosmeticRarity
  price: number
  currency: 'COINS' | 'DIAMONDS'
  /** Which of the character's anchor points this attaches to. */
  anchor: AnchorName
  /** Multiplier applied to the accessory only, on top of the anchor's scale. */
  scale: number
  offsetX: number
  offsetY: number
  rotation: number
  layer: LayerId
  /**
   * Art authored in absolute 120×132 coordinates instead of anchor-local
   * coordinates declares the point it was drawn around; the renderer shifts it
   * so that point lands on the anchor. Lets the original catalogue keep its
   * exact artwork while still gaining per-character fitting.
   */
  origin?: [number, number]
  /**
   * `viewbox` art is authored in the native 256×256 presentation space and is
   * never scaled — only nudged so it follows a character's anchor. `pad` art
   * lives in the 120×132 authoring grid (legacy catalogue).
   */
  space?: 'pad' | 'viewbox'
  render: () => JSX.Element
}

/** A catalogue entry resolved against the player's save. */
export type AccessoryInstance = Cosmetic & { unlocked: boolean; equipped: boolean }

export const COSMETIC_RARITY: Record<CosmeticRarity, { color: string; glow: string }> = {
  COMMON: { color: '#8ec5ff', glow: 'rgba(142,197,255,0.4)' },
  RARE: { color: '#b98bff', glow: 'rgba(185,139,255,0.5)' },
  EPIC: { color: '#ff7ad9', glow: 'rgba(255,122,217,0.55)' },
  LEGENDARY: { color: '#ffd24d', glow: 'rgba(255,210,77,0.6)' },
  MYTHIC: { color: '#7cf3ff', glow: 'rgba(124,243,255,0.65)' },
}

export const SLOT_LABEL: Record<Slot, string> = {
  hat: 'Hats',
  glasses: 'Glasses',
  wig: 'Wigs',
  shoes: 'Shoes',
  outfit: 'Costumes',
  accessory: 'Accessories',
  face: 'Face',
  wings: 'Wings',
  aura: 'Skins',
}

export const TYPE_LABEL: Record<AccessoryType, string> = {
  HAT: 'Hat',
  COSTUME: 'Costume',
  GLASSES: 'Glasses',
  FACE: 'Face',
  WIG: 'Wig',
  SHOES: 'Shoes',
  ACCESSORY: 'Accessory',
  SKIN: 'Skin',
}

/** Paint order inside a layer (earlier = further back). */
const TYPE_PAINT_ORDER: AccessoryType[] = ['SKIN', 'COSTUME', 'SHOES', 'ACCESSORY', 'FACE', 'GLASSES', 'WIG', 'HAT']

/** Back-to-front paint order of the layer groups emitted by `CharacterView`. */
export const LAYER_ORDER: LayerId[] = [
  'background-effects',
  'back-accessories',
  'body-accessories',
  'face-accessories',
  'head-accessories',
  'front-effects',
]

/* --- Premium accessory artwork -------------------------------------------
   Native 256×256 viewBox coordinates. Outfits wrap the lower body the way
   mozzarella's tutu does (roughly X 66–190 / Y 150–220) so the food identity
   and face stay visible. Hats sit on the crown. Glasses/face pieces sit on
   the eyes. Nothing here is a full-body costume pasted over the character. */

const AX_INK = '#1A1A1A'
const AX_SW = 3.2

/** LEGENDARY · Corona del Re — full headwear, X 60–196. */
function CoronaDelRe() {
  return (
    <g>
      <path
        d="M60 70 L74 18 L90 54 L106 12 L120 50 L128 8 L136 50 L150 12 L166 54 L182 18 L196 70 Z"
        fill="#FFD700"
        stroke={AX_INK}
        strokeWidth={AX_SW}
        strokeLinejoin="round"
      />
      <rect x="60" y="64" width="136" height="26" rx="8" fill="#FFC107" stroke={AX_INK} strokeWidth={AX_SW} />
      <circle cx="92" cy="77" r="8" fill="#E53935" stroke={AX_INK} strokeWidth="2.4" />
      <circle cx="128" cy="77" r="9" fill="#E53935" stroke={AX_INK} strokeWidth="2.4" />
      <circle cx="164" cy="77" r="8" fill="#E53935" stroke={AX_INK} strokeWidth="2.4" />
      <circle cx="88" cy="73" r="2.4" fill="#FFFFFF" />
      <circle cx="124" cy="73" r="2.6" fill="#FFFFFF" />
      <circle cx="160" cy="73" r="2.4" fill="#FFFFFF" />
    </g>
  )
}

/** RARE · Toque della Nonna — full chef hat, X 60–196. */
function ToqueDellaNonna() {
  return (
    <g>
      <ellipse cx="88" cy="36" rx="32" ry="28" fill="#FFFFFF" stroke={AX_INK} strokeWidth={AX_SW} />
      <ellipse cx="128" cy="24" rx="38" ry="32" fill="#FFFFFF" stroke={AX_INK} strokeWidth={AX_SW} />
      <ellipse cx="168" cy="36" rx="32" ry="28" fill="#FFFFFF" stroke={AX_INK} strokeWidth={AX_SW} />
      <ellipse cx="110" cy="44" rx="26" ry="22" fill="#FFFFFF" stroke={AX_INK} strokeWidth={AX_SW} />
      <ellipse cx="146" cy="44" rx="26" ry="22" fill="#FFFFFF" stroke={AX_INK} strokeWidth={AX_SW} />
      <rect x="60" y="62" width="136" height="26" rx="8" fill="#F5F5F5" stroke={AX_INK} strokeWidth={AX_SW} />
      <path d="M78 62 Q78 48 92 44" fill="none" stroke="#CFD8DC" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M128 62 Q128 40 128 28" fill="none" stroke="#CFD8DC" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M178 62 Q178 48 164 44" fill="none" stroke="#CFD8DC" strokeWidth="2.2" strokeLinecap="round" />
    </g>
  )
}

/** EPIC · Occhiali Neri — ≥100px wide across the eyes. */
function OcchialiNeri() {
  return (
    <g>
      <path d="M52 118 L68 122 L68 132 L52 128 Z" fill="#1A1A1A" />
      <path d="M204 118 L188 122 L188 132 L204 128 Z" fill="#1A1A1A" />
      <rect x="68" y="108" width="52" height="36" rx="10" fill="#111111" stroke={AX_INK} strokeWidth={AX_SW} />
      <rect x="136" y="108" width="52" height="36" rx="10" fill="#111111" stroke={AX_INK} strokeWidth={AX_SW} />
      <rect x="116" y="118" width="24" height="10" rx="3" fill="#1A1A1A" />
      <path d="M76 116 L112 116" stroke="#90A4AE" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      <path d="M144 116 L180 116" stroke="#90A4AE" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
    </g>
  )
}

/** COMMON · Baffi Italiani — ≥100px wide under the nose. */
function BaffiItaliani() {
  return (
    <g>
      <path
        d="M128 132 C108 128 88 130 72 140 C56 150 58 164 76 162 C88 160 94 150 88 146 C80 142 70 148 72 154 C78 144 96 138 112 142 C120 144 124 148 128 152 C128 148 124 136 128 132 Z"
        fill="#1A1A1A"
        stroke={AX_INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M128 132 C148 128 168 130 184 140 C200 150 198 164 180 162 C168 160 162 150 168 146 C176 142 186 148 184 154 C178 144 160 138 144 142 C136 144 132 148 128 152 C128 148 132 136 128 132 Z"
        fill="#1A1A1A"
        stroke={AX_INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </g>
  )
}

/** LEGENDARY · Armatura d'Oro — gold waist plate, tutu-scale, face left open. */
function ArmaturaDOro() {
  return (
    <g>
      <path
        d="M70 176 Q128 160 186 176 Q174 222 128 216 Q82 222 70 176 Z"
        fill="#FFD700"
        stroke={AX_INK}
        strokeWidth={AX_SW}
        strokeLinejoin="round"
      />
      <path d="M82 180 Q128 170 174 180" fill="none" stroke="#FFF8DC" strokeWidth="2.4" opacity="0.7" />
      <circle cx="128" cy="192" r="11" fill="#29B6F6" stroke={AX_INK} strokeWidth="2.6" />
      <circle cx="124" cy="188" r="3.6" fill="#FFFFFF" />
    </g>
  )
}

/** EPIC · Pinstripe del Don — jacket hem around the waist, like Anatra's suit. */
function PinstripeDelDon() {
  return (
    <g>
      <path
        d="M72 174 Q128 158 184 174 L176 224 Q128 234 80 224 Z"
        fill="#212121"
        stroke={AX_INK}
        strokeWidth={AX_SW}
        strokeLinejoin="round"
      />
      <g stroke="#EEEEEE" strokeWidth="2" opacity="0.4" fill="none">
        <path d="M92 176 L88 222" />
        <path d="M112 168 L110 226" />
        <path d="M144 168 L146 226" />
        <path d="M164 176 L168 222" />
      </g>
      <path d="M116 174 L128 184 L140 174 L136 212 L128 220 L120 212 Z" fill="#FAFAFA" stroke={AX_INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M124 184 L128 188 L132 184 L130 212 L128 220 L126 212 Z" fill="#D50000" stroke={AX_INK} strokeWidth="2" strokeLinejoin="round" />
    </g>
  )
}

/** RARE · Grembiule dello Chef — bib + skirt that sits under the face. */
function GrembiuleDelloChef() {
  return (
    <g>
      <path d="M102 166 Q128 156 154 166" fill="none" stroke="#C62828" strokeWidth="8" strokeLinecap="round" />
      <path
        d="M80 176 H176 L184 200 L188 228 C128 238 68 228 72 200 Z"
        fill="#FAFAFA"
        stroke={AX_INK}
        strokeWidth={AX_SW}
        strokeLinejoin="round"
      />
      <path d="M76 198 H180" fill="none" stroke="#C62828" strokeWidth="8" strokeLinecap="round" />
    </g>
  )
}

/* --- Catalogue ----------------------------------------------------------- */

/**
 * Defaults keep each entry terse; only the fields that differ from a neutral
 * placement need to be written out.
 */
function acc(c: Omit<Cosmetic, 'scale' | 'offsetX' | 'offsetY' | 'rotation' | 'currency' | 'space'> & Partial<Cosmetic>): Cosmetic {
  return { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, currency: 'COINS', space: 'pad', ...c }
}

export const COSMETICS: Cosmetic[] = [
  /* ---- Premium 2.5D accessory line (the lootbox pool) ---- */
  acc({
    id: 're_crown',
    name: 'Corona del Re',
    slot: 'hat',
    type: 'HAT',
    rarity: 'LEGENDARY',
    price: 4800,
    anchor: 'head',
    layer: 'head-accessories',
    space: 'viewbox',
    render: CoronaDelRe,
  }),
  acc({
    id: 'golden_armor',
    name: "Armatura d'Oro",
    slot: 'outfit',
    type: 'COSTUME',
    rarity: 'LEGENDARY',
    price: 5000,
    anchor: 'body',
    layer: 'body-accessories',
    space: 'viewbox',
    render: ArmaturaDOro,
  }),
  acc({
    id: 'pinstripe_suit',
    name: 'Pinstripe del Don',
    slot: 'outfit',
    type: 'COSTUME',
    rarity: 'EPIC',
    price: 2200,
    anchor: 'body',
    layer: 'body-accessories',
    space: 'viewbox',
    render: PinstripeDelDon,
  }),
  acc({
    id: 'mafia_sunglasses',
    name: 'Occhiali Neri',
    slot: 'glasses',
    type: 'GLASSES',
    rarity: 'EPIC',
    price: 1500,
    anchor: 'face',
    layer: 'face-accessories',
    space: 'viewbox',
    render: OcchialiNeri,
  }),
  acc({
    id: 'chef_apron',
    name: 'Grembiule dello Chef',
    slot: 'outfit',
    type: 'COSTUME',
    rarity: 'RARE',
    price: 360,
    anchor: 'body',
    layer: 'body-accessories',
    space: 'viewbox',
    render: GrembiuleDelloChef,
  }),
  acc({
    id: 'chef_toque',
    name: 'Toque della Nonna',
    slot: 'hat',
    type: 'HAT',
    rarity: 'RARE',
    price: 380,
    anchor: 'head',
    layer: 'head-accessories',
    space: 'viewbox',
    render: ToqueDellaNonna,
  }),
  acc({
    id: 'italian_mustache',
    name: 'Baffi Italiani',
    slot: 'face',
    type: 'FACE',
    rarity: 'COMMON',
    price: 90,
    anchor: 'face',
    layer: 'face-accessories',
    space: 'viewbox',
    render: BaffiItaliani,
  }),

  /* ---- Original catalogue. Authored in absolute 120×132 coordinates, so
     each declares the point it was drawn around and is then placed on the
     matching anchor — same artwork, now fitted per character. ---- */
  acc({
    id: 'party_hat',
    name: 'Festa Hat',
    slot: 'hat',
    type: 'HAT',
    rarity: 'COMMON',
    price: 120,
    anchor: 'head',
    layer: 'head-accessories',
    origin: [60, 26],
    render: () => (
      <g>
        <path d="M60 -2 L48 26 L72 26 Z" fill="#ff6aa9" />
        <path d="M60 -2 L54 26 h6 Z" fill="#ffd24d" />
        <circle cx="60" cy="-2" r="3.5" fill="#6ee7a8" />
        <circle cx="53" cy="16" r="1.6" fill="#fff" />
        <circle cx="66" cy="20" r="1.6" fill="#fff" />
      </g>
    ),
  }),
  acc({
    id: 'shades',
    name: "Don's Shades",
    slot: 'glasses',
    type: 'GLASSES',
    rarity: 'COMMON',
    price: 100,
    anchor: 'face',
    layer: 'face-accessories',
    origin: [60, 53],
    render: () => (
      <g fill="#20202c">
        <rect x="40" y="48" width="16" height="11" rx="4" />
        <rect x="64" y="48" width="16" height="11" rx="4" />
        <rect x="55" y="51" width="10" height="3" />
        <rect x="42" y="50" width="6" height="3" rx="1.5" fill="#6a6a80" />
      </g>
    ),
  }),
  acc({
    id: 'sneakers',
    name: 'Gelato Sneakers',
    slot: 'shoes',
    type: 'SHOES',
    rarity: 'COMMON',
    price: 90,
    anchor: 'feet',
    layer: 'body-accessories',
    origin: [60, 118],
    render: () => (
      <g>
        <ellipse cx="47" cy="118" rx="10" ry="5" fill="#ff5a7a" />
        <ellipse cx="73" cy="118" rx="10" ry="5" fill="#ff5a7a" />
        <path d="M39 118 h16 M65 118 h16" stroke="#fff" strokeWidth="2" />
      </g>
    ),
  }),
  acc({
    id: 'bowtie',
    name: 'Trattoria Bowtie',
    slot: 'accessory',
    type: 'ACCESSORY',
    rarity: 'COMMON',
    price: 80,
    anchor: 'chest',
    layer: 'body-accessories',
    origin: [60, 92],
    render: () => (
      <g fill="#e0405f">
        <path d="M60 92 l-12 -6 v12 Z" />
        <path d="M60 92 l12 -6 v12 Z" />
        <circle cx="60" cy="92" r="3" fill="#ffd24d" />
      </g>
    ),
  }),
  acc({
    id: 'top_hat',
    name: 'Cilindro del Don',
    slot: 'hat',
    type: 'HAT',
    rarity: 'RARE',
    price: 350,
    anchor: 'head',
    layer: 'head-accessories',
    origin: [60, 22],
    render: () => (
      <g>
        <ellipse cx="60" cy="22" rx="26" ry="6" fill="#2a2338" />
        <rect x="44" y="-6" width="32" height="28" rx="4" fill="#332a45" />
        <rect x="44" y="14" width="32" height="6" fill="#b98bff" />
      </g>
    ),
  }),
  acc({
    id: 'rainbow_wig',
    name: 'Tutti Frutti Wig',
    slot: 'wig',
    type: 'WIG',
    rarity: 'RARE',
    price: 400,
    anchor: 'head',
    layer: 'head-accessories',
    origin: [60, 44],
    render: () => (
      <g>
        <path d="M30 46 Q30 18 60 16 Q90 18 90 46 Q80 34 60 34 Q40 34 30 46 Z" fill="#ff6aa9" />
        <path d="M32 44 q6 -14 14 -14" stroke="#ffd24d" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M60 30 v-6" stroke="#6ee7a8" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M88 44 q-6 -14 -14 -14" stroke="#8ec5ff" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
    ),
  }),
  acc({
    id: 'scarf',
    name: 'Sciarpa di Seta',
    slot: 'accessory',
    type: 'ACCESSORY',
    rarity: 'RARE',
    price: 320,
    anchor: 'chest',
    layer: 'body-accessories',
    origin: [60, 88],
    render: () => (
      <g fill="#b98bff">
        <path d="M40 86 q20 12 40 0 l0 8 q-20 10 -40 0 Z" />
        <path d="M74 92 l8 20 l-6 2 l-6 -18 Z" />
      </g>
    ),
  }),
  acc({
    id: 'halo',
    name: "Nonna's Halo",
    slot: 'wings',
    type: 'ACCESSORY',
    rarity: 'RARE',
    price: 450,
    anchor: 'head',
    layer: 'front-effects',
    origin: [60, 22],
    render: () => (
      <g>
        <ellipse cx="60" cy="10" rx="20" ry="6" fill="none" stroke="#ffe27a" strokeWidth="4" />
        <ellipse cx="60" cy="10" rx="20" ry="6" fill="none" stroke="#fff6c0" strokeWidth="1.5" />
      </g>
    ),
  }),
  acc({
    id: 'star_glasses',
    name: 'Limoncello Stars',
    slot: 'glasses',
    type: 'GLASSES',
    rarity: 'EPIC',
    price: 1600,
    anchor: 'face',
    layer: 'face-accessories',
    origin: [60, 53],
    render: () => {
      const star = (cx: number) =>
        `M${cx} 47 l2.6 5.4 l6 .8 l-4.3 4.2 l1 6 l-5.3 -2.8 l-5.3 2.8 l1 -6 l-4.3 -4.2 l6 -.8 Z`
      return (
        <g fill="#ff2d9b" stroke="#fff" strokeWidth="0.8">
          <path d={star(48)} />
          <path d={star(72)} />
          <rect x="55" y="52" width="10" height="2.5" fill="#ff2d9b" />
        </g>
      )
    },
  }),
  acc({
    id: 'flame_wig',
    name: 'Arrabbiata Mohawk',
    slot: 'wig',
    type: 'WIG',
    rarity: 'EPIC',
    price: 1750,
    anchor: 'head',
    layer: 'head-accessories',
    origin: [60, 34],
    render: () => (
      <g>
        <path d="M52 34 Q54 6 60 2 Q66 6 68 34 Z" fill="#ff8a3c" />
        <path d="M56 32 Q58 12 60 8 Q62 12 64 32 Z" fill="#ffd24d" />
        <path d="M44 36 Q46 20 52 20 L54 36 Z" fill="#ff6a3c" />
        <path d="M76 36 Q74 20 68 20 L66 36 Z" fill="#ff6a3c" />
      </g>
    ),
  }),
  acc({
    id: 'angel_wings',
    name: 'Ali di Cupidino',
    slot: 'wings',
    type: 'ACCESSORY',
    rarity: 'EPIC',
    price: 2100,
    anchor: 'back',
    layer: 'back-accessories',
    origin: [60, 78],
    render: () => (
      <g fill="#f8f4ff" stroke="#c9b8ff" strokeWidth="1.6">
        <path d="M40 70 C8 42 -6 58 6 82 C-4 102 22 96 42 86 C24 84 28 76 40 70 Z" />
        <path d="M80 70 C112 42 126 58 114 82 C124 102 98 96 78 86 C96 84 92 76 80 70 Z" />
        <path d="M36 78 C18 70 10 78 16 88" fill="none" stroke="#fff" strokeWidth="1.2" />
        <path d="M84 78 C102 70 110 78 104 88" fill="none" stroke="#fff" strokeWidth="1.2" />
      </g>
    ),
  }),
  acc({
    id: 'crown_hat',
    name: "Corona d'Oro",
    slot: 'hat',
    type: 'HAT',
    rarity: 'LEGENDARY',
    price: 4200,
    anchor: 'head',
    layer: 'head-accessories',
    origin: [60, 24],
    render: () => (
      <g>
        <path d="M40 22 L44 2 L52 14 L60 -2 L68 14 L76 2 L80 22 Z" fill="#ffd24d" stroke="#f0a81e" strokeWidth="1" />
        <rect x="40" y="20" width="40" height="5" rx="2" fill="#f0a81e" />
        <circle cx="52" cy="12" r="2.4" fill="#7ad0ff" />
        <circle cx="60" cy="8" r="3" fill="#ff7ad9" />
        <circle cx="68" cy="12" r="2.4" fill="#7ad0ff" />
      </g>
    ),
  }),
  acc({
    id: 'golden_boots',
    name: "Stivali d'Oro",
    slot: 'shoes',
    type: 'SHOES',
    rarity: 'LEGENDARY',
    price: 3600,
    anchor: 'feet',
    layer: 'body-accessories',
    origin: [60, 118],
    render: () => (
      <g>
        <ellipse cx="47" cy="118" rx="11" ry="5.5" fill="#ffd24d" stroke="#f0a81e" strokeWidth="1" />
        <ellipse cx="73" cy="118" rx="11" ry="5.5" fill="#ffd24d" stroke="#f0a81e" strokeWidth="1" />
        <ellipse cx="43" cy="116" rx="3" ry="1.4" fill="#fff8dc" />
        <ellipse cx="69" cy="116" rx="3" ry="1.4" fill="#fff8dc" />
      </g>
    ),
  }),
  acc({
    id: 'galaxy_wings',
    name: 'Ali Galassia',
    slot: 'wings',
    type: 'ACCESSORY',
    rarity: 'LEGENDARY',
    price: 5500,
    anchor: 'back',
    layer: 'back-accessories',
    origin: [60, 78],
    render: () => (
      <g>
        <defs>
          <linearGradient id="ax-galaxy" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7ad0ff" />
            <stop offset="50%" stopColor="#b98bff" />
            <stop offset="100%" stopColor="#ff7ad9" />
          </linearGradient>
        </defs>
        <path d="M42 68 C6 36 -10 54 4 84 C-8 108 26 100 44 86 C20 84 24 74 42 68 Z" fill="url(#ax-galaxy)" />
        <path d="M78 68 C114 36 130 54 116 84 C128 108 94 100 76 86 C100 84 96 74 78 68 Z" fill="url(#ax-galaxy)" />
        <circle cx="10" cy="70" r="1.8" fill="#fff" />
        <circle cx="20" cy="80" r="1.2" fill="#fff" />
        <circle cx="110" cy="70" r="1.8" fill="#fff" />
        <circle cx="100" cy="80" r="1.2" fill="#fff" />
      </g>
    ),
  }),
  acc({
    id: 'rainbow_aura',
    name: 'Aura Gelato',
    slot: 'aura',
    type: 'SKIN',
    rarity: 'LEGENDARY',
    price: 4500,
    anchor: 'back',
    layer: 'background-effects',
    origin: [60, 64],
    render: () => (
      <g>
        <defs>
          <radialGradient id="ax-aura" cx="50%" cy="48%" r="52%">
            <stop offset="55%" stopColor="rgba(255,255,255,0)" />
            <stop offset="80%" stopColor="rgba(255,122,217,0.55)" />
            <stop offset="100%" stopColor="rgba(122,208,255,0)" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="64" r="60" fill="url(#ax-aura)" />
      </g>
    ),
  }),
  acc({
    id: 'don_fedora',
    name: 'Fedora del Don',
    slot: 'hat',
    type: 'HAT',
    rarity: 'EPIC',
    price: 1800,
    anchor: 'head',
    layer: 'head-accessories',
    origin: [60, 24],
    render: () => (
      <g>
        <ellipse cx="60" cy="24" rx="34" ry="7" fill="#1a1424" />
        <path d="M38 24 Q40 2 60 2 Q80 2 82 24 Z" fill="#2a2238" />
        <rect x="40" y="18" width="40" height="5" rx="2" fill="#c9a227" />
      </g>
    ),
  }),
]

/** The premium line, in lootbox-drop order. Data-driven so it can be extended. */
export const ACCESSORY_POOL = [
  're_crown',
  'golden_armor',
  'pinstripe_suit',
  'mafia_sunglasses',
  'chef_apron',
  'chef_toque',
  'italian_mustache',
] as const

export function cosmeticById(id: string | undefined) {
  return id ? COSMETICS.find((c) => c.id === id) : undefined
}

export function cosmeticsForCharacter(charId: string, equipped: Record<string, Record<string, string>>) {
  return equipped[charId] ?? {}
}

/**
 * Composes an accessory's placement transform from the target character's
 * anchor. Note that nothing here ever touches the character — the accessory
 * absorbs 100% of the fitting.
 *
 * `viewbox` art is only translated (never scaled) so it follows the character's
 * anchor relative to `DEFAULT_ANCHORS`. `pad` art keeps the legacy
 * origin/scale/rotate placement in the 120×132 grid.
 */
function accessoryTransform(c: Cosmetic, anchors: CharacterAnchors): string {
  const a = anchors[c.anchor]
  if (c.space === 'viewbox') {
    const def = DEFAULT_ANCHORS[c.anchor]
    const tx = (a.x - def.x) * ART_SCALE + c.offsetX
    const ty = (a.y - def.y) * ART_SCALE + c.offsetY
    const parts = [`translate(${tx} ${ty})`]
    const rotation = a.rotation + c.rotation
    if (rotation !== 0) parts.push(`rotate(${rotation} 128 128)`)
    return parts.join(' ')
  }
  const parts = [`translate(${a.x + c.offsetX} ${a.y + c.offsetY})`]
  const rotation = a.rotation + c.rotation
  if (rotation !== 0) parts.push(`rotate(${rotation})`)
  const scale = a.scale * c.scale
  if (scale !== 1) parts.push(`scale(${scale})`)
  if (c.origin) parts.push(`translate(${-c.origin[0]} ${-c.origin[1]})`)
  return parts.join(' ')
}

/** Resolves the whole catalogue against the save — the real inventory view. */
export function useAccessoryInventory(charId: string): AccessoryInstance[] {
  const { cosmetics, equipped } = useGameState()
  const eq = equipped[charId] ?? {}
  return COSMETICS.map((c) => ({
    ...c,
    unlocked: isFounder() || cosmetics.includes(c.id),
    equipped: eq[c.slot] === c.id,
  }))
}

/**
 * The composed character mark: ONE svg on the immutable `ART_VIEW_BOX`, with
 * the base character in an untransformed `#character-base` group and each
 * accessory in its own layer group.
 *
 * `pad` accessories and `#character-base` live inside `ART_CONTENT_TRANSFORM`.
 * `viewbox` accessories are sibling groups outside that transform so they are
 * never scaled. Paint order: pad background/back, viewbox background/back,
 * character-base, pad body/face/head/front, viewbox body/face/head/front.
 *
 * Used both for live rendering and for server-side markup (share cards), so a
 * shared score image can never disagree with what the player sees.
 */
function CompositeLayers({
  charId,
  equipped,
}: {
  charId: string
  equipped: Record<string, string>
}) {
  const Body = bodyFor(charId)
  const anchors = anchorsFor(charId)
  const worn = Object.values(equipped)
    .map(cosmeticById)
    .filter((c): c is Cosmetic => Boolean(c))
    .sort((a, b) => TYPE_PAINT_ORDER.indexOf(a.type) - TYPE_PAINT_ORDER.indexOf(b.type))

  const layer = (id: LayerId, space: 'pad' | 'viewbox') =>
    worn
      .filter((c) => c.layer === id && (c.space === 'viewbox' ? 'viewbox' : 'pad') === space)
      .map((c) => (
        <g key={c.id} transform={accessoryTransform(c, anchors)}>
          {c.render()}
        </g>
      ))

  return (
    <>
      <g transform={ART_CONTENT_TRANSFORM}>
        <g id="background-effects">{layer('background-effects', 'pad')}</g>
        <g id="back-accessories">{layer('back-accessories', 'pad')}</g>
      </g>
      {layer('background-effects', 'viewbox')}
      {layer('back-accessories', 'viewbox')}
      <g transform={ART_CONTENT_TRANSFORM}>
        <g id="character-base">{Body()}</g>
        <g id="body-accessories">{layer('body-accessories', 'pad')}</g>
        <g id="face-accessories">{layer('face-accessories', 'pad')}</g>
        <g id="head-accessories">{layer('head-accessories', 'pad')}</g>
        <g id="front-effects">{layer('front-effects', 'pad')}</g>
      </g>
      {layer('body-accessories', 'viewbox')}
      {layer('face-accessories', 'viewbox')}
      {layer('head-accessories', 'viewbox')}
      {layer('front-effects', 'viewbox')}
    </>
  )
}

/**
 * Synchronous bbox measure for static markup (share cards, 3D textures).
 * Live React views measure via `useLayoutEffect` instead.
 */
export function measureFitScale(charId: string, equipped: Record<string, string>): number {
  const key = fitCacheKey(charId, equipped)
  const cached = peekFitScale(key)
  if (cached != null) return cached
  if (typeof document === 'undefined') return 1

  const markup = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={ART_VIEW_BOX} width="256" height="256">
      <g id="character-fit-inner">
        <CompositeLayers charId={charId} equipped={equipped} />
      </g>
    </svg>,
  )
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml')
  const svg = parsed.documentElement
  svg.setAttribute('width', '256')
  svg.setAttribute('height', '256')
  svg.style.position = 'absolute'
  svg.style.left = '-99999px'
  svg.style.top = '0'
  document.body.appendChild(svg)
  const inner = svg.querySelector('#character-fit-inner') as SVGGElement | null
  const scale = inner ? fitScaleFromBBox(inner.getBBox()) : 1
  svg.remove()
  return rememberFitScale(key, scale)
}

export function CharacterComposite({
  charId,
  equipped,
  className,
  style,
  fitScale,
}: {
  charId: string
  equipped: Record<string, string>
  className?: string
  style?: CSSProperties
  /** When set (share/3D), skip the live measure and use this scale. */
  fitScale?: number
}) {
  const key = fitCacheKey(charId, equipped)
  const innerRef = useRef<SVGGElement>(null)
  const [scale, setScale] = useState(() => fitScale ?? peekFitScale(key) ?? 1)

  useLayoutEffect(() => {
    if (fitScale != null) {
      rememberFitScale(key, fitScale)
      setScale(fitScale)
      return
    }
    const inner = innerRef.current
    if (!inner) return
    const next = rememberFitScale(key, fitScaleFromBBox(inner.getBBox()))
    setScale((prev) => (prev === next ? prev : next))
  }, [key, fitScale])

  return (
    <svg
      viewBox={ART_VIEW_BOX}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      overflow="hidden"
      className={className}
      style={{ overflow: 'hidden', ...style }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={charId}
    >
      <g id="character-fit" transform={fitTransform(scale)}>
        <g id="character-fit-inner" ref={innerRef}>
          <CompositeLayers charId={charId} equipped={equipped} />
        </g>
      </g>
    </svg>
  )
}

/** Character art with any equipped accessories layered on top. */
export function CharacterView({
  charId,
  className,
  style,
  equippedOverride,
}: {
  charId: string
  className?: string
  style?: CSSProperties
  equippedOverride?: Record<string, string>
}) {
  const { equipped } = useGameState()
  const eq = equippedOverride ?? equipped[charId] ?? {}
  return (
    <div className={className} style={{ position: 'relative', display: 'block', overflow: 'hidden', flexShrink: 0, ...style }}>
      <CharacterComposite charId={charId} equipped={eq} className="block h-full w-full" />
    </div>
  )
}

/** Standalone premium artwork for one accessory, for cards and shop tiles. */
export function AccessoryArt({ id, className, style }: { id: string; className?: string; style?: CSSProperties }) {
  const c = cosmeticById(id)
  if (!c) return null
  const svgProps = {
    viewBox: ART_VIEW_BOX,
    preserveAspectRatio: 'xMidYMid meet' as const,
    overflow: 'visible' as const,
    className,
    style: { overflow: 'visible' as const, ...style },
    xmlns: 'http://www.w3.org/2000/svg',
    role: 'img' as const,
    'aria-label': c.name,
  }
  if (c.space === 'viewbox') {
    return <svg {...svgProps}>{c.render()}</svg>
  }
  // Centre the accessory's own local space in the frame so it reads as a
  // product shot rather than a piece pinned to an invisible character.
  const t = c.origin ? `translate(${60 - c.origin[0]} ${66 - c.origin[1]})` : 'translate(60 66)'
  return (
    <svg {...svgProps}>
      <g transform={ART_CONTENT_TRANSFORM}>
        <g transform={`${t} scale(1.7)`}>
          <g transform={c.origin ? '' : 'translate(0 6)'}>{c.render()}</g>
        </g>
      </g>
    </svg>
  )
}
