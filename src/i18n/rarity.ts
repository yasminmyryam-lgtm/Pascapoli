import type { MessageKey } from './dictionary'

const RARITY_KEYS = {
  FREE: 'rarity.free',
  COMMON: 'rarity.common',
  RARE: 'rarity.rare',
  EPIC: 'rarity.epic',
  LEGENDARY: 'rarity.legendary',
  MYTHIC: 'rarity.mythic',
} as const satisfies Record<string, MessageKey>

export function rarityMessageKey(rarity: string): MessageKey {
  return RARITY_KEYS[rarity as keyof typeof RARITY_KEYS] ?? 'rarity.common'
}
