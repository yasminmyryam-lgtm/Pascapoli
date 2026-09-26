import type { JSX } from 'react'
import { DEFAULT_ANCHORS, toArt, type ArtProps, type BodyFn, type CharacterAnchors } from './art/kit'
import { LEGACY_ANCHORS, LEGACY_BODIES } from './art/legacy'
import { PORTRAIT_ANCHORS, PORTRAIT_BODIES } from './art/portraits'

/**
 * The "Pastapoli" roster.
 *
 * Artwork lives in `src/art/*` as `BodyFn`s — inner SVG content authored in the
 * immutable 120×132 space (see `art/kit.tsx`). This module owns the roster data
 * and the two registries the renderer needs: `BODIES` (base artwork) and
 * `ANCHORS` (per-character accessory attachment points).
 */

export type Rarity = 'FREE' | 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC'

export type Character = {
  id: string
  name: string
  tag: string
  rarity: Rarity
  price: number
  unlockLevel: number
  currency?: 'COINS' | 'DIAMONDS'
  /** MYTHIC only: how many chest cards are needed to unlock. Never buyable with currency. */
  cardsNeeded?: number
  /**
   * Wingless (or otherwise stripped) base image in `/public/characters`.
   * Used only while a back-mounted wings accessory is equipped.
   * The file can be added later; until then the name is the contract.
   */
  altBaseSprite?: string
  Art: (p: ArtProps) => JSX.Element
}

/** Every MYTHIC character keyed by id -> cards required. Single source of truth. */
export const MYTHIC_CARD_COST: Record<string, number> = {
  'spaghettino-fantasmino': 10,
}

export function cardsRequired(id: string): number {
  return MYTHIC_CARD_COST[id] ?? 0
}

/** Ids that can drop as chest cards, in rising rarity order. */
export const CARD_POOL = ['spaghettino-fantasmino'] as const

/* Art registries ---------------------------------------------------------- */

/** Base artwork for every character, keyed by save id. */
export const BODIES: Record<string, BodyFn> = {
  ...LEGACY_BODIES,
  ...PORTRAIT_BODIES,
}

/**
 * Where accessories attach on each character. Silhouettes vary wildly — a wide
 * croissant, a tall gelato cone, a koala with huge ears — so each character
 * supplies its own coordinates, scale and rotation per attachment point. This
 * is what lets one crown sit correctly on all of them.
 */
export const ANCHORS: Record<string, CharacterAnchors> = {
  ...LEGACY_ANCHORS,
  ...PORTRAIT_ANCHORS,
}

const FALLBACK_ID = 'mozzarella'

export function bodyFor(id: string): BodyFn {
  return BODIES[id] ?? BODIES[FALLBACK_ID]
}

export function anchorsFor(id: string): CharacterAnchors {
  return ANCHORS[id] ?? DEFAULT_ANCHORS
}

/* Roster ------------------------------------------------------------------ */

/**
 * Ids are permanent save keys — renaming a character only ever changes `name`,
 * never `id`, so existing `owned` / `selected` / `equipped` data keeps working.
 */
const ROSTER: Omit<Character, 'Art'>[] = [
  { id: 'mozzarella', name: 'Mozzarella Tarantella', tag: 'Prima ballerina of the fridge', rarity: 'FREE', price: 0, unlockLevel: 1 },
  { id: 'espressino', name: 'Macchiato Mascherato', tag: 'Steals hearts & spare change', rarity: 'COMMON', price: 250, unlockLevel: 1 },
  { id: 'panino', name: 'Panino Bambino', tag: 'Wanted in three trattorias', rarity: 'COMMON', price: 250, unlockLevel: 2 },
  { id: 'limone', name: 'Limoncello Monello', tag: 'Zesty & slightly unhinged', rarity: 'COMMON', price: 800, unlockLevel: 3 },
  { id: 'pizzarino', name: 'Pizzetta Vendetta', tag: 'Delivers itself, extra fast', rarity: 'COMMON', price: 800, unlockLevel: 4 },
  { id: 'spaghetto', name: 'Spaghetto Fantasma', tag: 'Haunts the pasta aisle', rarity: 'COMMON', price: 5200, unlockLevel: 7 },
  { id: 'olive-ocarina', name: 'Olive Ocarina', tag: 'Plays a salty little tune', rarity: 'RARE', price: 950, unlockLevel: 5 },
  { id: 'fursecino-fortino', name: 'Fursecino Fortino', tag: 'Cookie muscle, zero crumbs', rarity: 'EPIC', price: 6400, unlockLevel: 8 },
  { id: 'fursecina-fatina', name: 'Fursecina Fatina', tag: 'Fairy cookie, extra chocolate', rarity: 'EPIC', price: 6800, unlockLevel: 8, altBaseSprite: 'Fursecina-Fatina-wingless.png' },
  { id: 'donutino-batutino', name: 'Donutino Batutino', tag: 'Glazed, horned, airborne', rarity: 'EPIC', price: 7200, unlockLevel: 9 },
  { id: 'donutina-fantina', name: 'Donutina Fantina', tag: 'Sprinkles and fairy wings', rarity: 'EPIC', price: 7800, unlockLevel: 9, altBaseSprite: 'Donutina-Fantina-wingless.png' },
  { id: 'risotto-roboto', name: 'Risotto Roboto', tag: 'Creamy circuits, al dente', rarity: 'LEGENDARY', price: 16000, unlockLevel: 12 },
  { id: 'pestino-pinguino', name: 'Pestino Pinguino', tag: 'Basil feathers, icy stare', rarity: 'LEGENDARY', price: 19000, unlockLevel: 14 },
  { id: 'llama-lasagna', name: 'Llama Lasagna', tag: 'Layers on layers, no spit', rarity: 'LEGENDARY', price: 22000, unlockLevel: 15 },
  { id: 'spaghettino-fantasmino', name: 'Spaghettino Fantasmino', tag: 'A noodle ghost with feelings', rarity: 'MYTHIC', price: 0, unlockLevel: 1, cardsNeeded: MYTHIC_CARD_COST['spaghettino-fantasmino'] },
]

export const CHARACTER_IDS = new Set(ROSTER.map((c) => c.id))

/**
 * `Art` is derived from the same body function the composite renderer uses, so
 * a standalone character mark and an accessorised one can never drift apart.
 */
export const CHARACTERS: Character[] = ROSTER.map((c) => ({ ...c, Art: toArt(c.name, bodyFor(c.id)) }))

export function characterById(id: string): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
}
