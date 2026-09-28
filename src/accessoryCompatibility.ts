import type { AccessoryType, Slot } from './cosmetics'

/**
 * Which accessories each character may wear.
 * Aura is included only where a character's rule allows it.
 * Characters missing from this list are unrestricted. Spaghettino Fantasmino was not in the QA list.
 */

type ItemRef = { id: string; slot: string; type: string }

type AllowRule = {
  ids?: readonly string[]
  slots?: readonly Slot[]
  types?: readonly AccessoryType[]
}

type Rule = { kind: 'all' } | { kind: 'only'; allow: AllowRule } | { kind: 'except'; deny: AllowRule }

const ALL: Rule = { kind: 'all' }

const RULES: Record<string, Rule> = {
  mozzarella: ALL,
  espressino: {
    kind: 'only',
    allow: { ids: ['mafia_sunglasses', 'italian_mustache', 'golden_boots'], slots: ['aura'] },
  },
  panino: {
    kind: 'except',
    deny: { ids: ['flame_wig', 'rainbow_wig', 'scarf', 'chef_apron'], slots: ['outfit'] },
  },
  limone: {
    kind: 'except',
    deny: {
      ids: ['scarf', 'mafia_sunglasses', 'star_glasses', 'rainbow_wig', 'bowtie'],
      slots: ['outfit'],
    },
  },
  pizzarino: {
    kind: 'only',
    allow: { ids: ['italian_mustache', 'scarf', 'halo'], slots: ['hat', 'aura'] },
  },
  spaghetto: {
    kind: 'only',
    allow: { ids: ['bowtie'], slots: ['glasses', 'shoes', 'wings', 'aura'] },
  },
  'olive-ocarina': {
    kind: 'only',
    allow: { slots: ['shoes', 'wings', 'aura'] },
  },
  'fursecino-fortino': {
    kind: 'only',
    allow: { ids: ['bowtie'], slots: ['glasses', 'wings', 'aura'] },
  },
  'fursecina-fatina': {
    kind: 'only',
    allow: { ids: ['halo'], slots: ['hat', 'shoes', 'aura'] },
  },
  'donutino-batutino': {
    kind: 'only',
    allow: { ids: ['bowtie', 'halo'], slots: ['shoes', 'aura'] },
  },
  'donutina-fantina': {
    kind: 'only',
    allow: { ids: ['re_crown', 'crown_hat', 'don_fedora', 'bowtie', 'halo'], slots: ['shoes', 'aura'] },
  },
  'risotto-roboto': {
    kind: 'only',
    allow: { ids: ['bowtie', 'halo'], slots: ['wings', 'aura'] },
  },
  'pestino-pinguino': {
    kind: 'only',
    allow: { ids: ['shades', 'star_glasses', 'bowtie'], slots: ['wings'] },
  },
  'llama-lasagna': {
    kind: 'only',
    allow: { ids: ['halo'], slots: ['aura'] },
  },
}

/** Slot and type for each catalogue id. Used when a save only stores the id. */
const META: Record<string, { slot: Slot; type: AccessoryType }> = {
  re_crown: { slot: 'hat', type: 'HAT' },
  golden_armor: { slot: 'outfit', type: 'COSTUME' },
  pinstripe_suit: { slot: 'outfit', type: 'COSTUME' },
  mafia_sunglasses: { slot: 'glasses', type: 'GLASSES' },
  chef_apron: { slot: 'outfit', type: 'COSTUME' },
  chef_toque: { slot: 'hat', type: 'HAT' },
  italian_mustache: { slot: 'face', type: 'FACE' },
  party_hat: { slot: 'hat', type: 'HAT' },
  shades: { slot: 'glasses', type: 'GLASSES' },
  sneakers: { slot: 'shoes', type: 'SHOES' },
  bowtie: { slot: 'accessory', type: 'ACCESSORY' },
  top_hat: { slot: 'hat', type: 'HAT' },
  rainbow_wig: { slot: 'wig', type: 'WIG' },
  scarf: { slot: 'accessory', type: 'ACCESSORY' },
  halo: { slot: 'wings', type: 'ACCESSORY' },
  star_glasses: { slot: 'glasses', type: 'GLASSES' },
  flame_wig: { slot: 'wig', type: 'WIG' },
  angel_wings: { slot: 'wings', type: 'ACCESSORY' },
  crown_hat: { slot: 'hat', type: 'HAT' },
  golden_boots: { slot: 'shoes', type: 'SHOES' },
  galaxy_wings: { slot: 'wings', type: 'ACCESSORY' },
  rainbow_aura: { slot: 'aura', type: 'SKIN' },
  don_fedora: { slot: 'hat', type: 'HAT' },
}

function listed(rule: AllowRule, item: ItemRef): boolean {
  if (rule.ids?.includes(item.id)) return true
  if (rule.slots?.includes(item.slot as Slot)) return true
  if (rule.types?.includes(item.type as AccessoryType)) return true
  return false
}

export function isAccessoryCompatible(charId: string, item: ItemRef): boolean {
  const rule = RULES[charId] ?? ALL
  if (rule.kind === 'all') return true
  if (rule.kind === 'only') return listed(rule.allow, item)
  return !listed(rule.deny, item)
}

export function isAccessoryCompatibleById(charId: string, cosmeticId: string): boolean {
  const meta = META[cosmeticId]
  if (!meta) return (RULES[charId] ?? ALL).kind === 'all'
  return isAccessoryCompatible(charId, { id: cosmeticId, slot: meta.slot, type: meta.type })
}

/** Drops worn items the character is not allowed to keep. */
export function compatibleLoadout(charId: string, slots: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [slot, id] of Object.entries(slots)) {
    if (typeof id !== 'string') continue
    const meta = META[id]
    if (!meta || meta.slot !== slot) continue
    if (isAccessoryCompatible(charId, { id, slot: meta.slot, type: meta.type })) next[slot] = id
  }
  return next
}
