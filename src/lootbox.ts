/**
 * MYTHIC LOOTBOX REWARD POOL
 * ==========================
 * Pure configuration — deliberately free of imports so the store can roll
 * rewards without pulling in artwork. Ids reference the real catalogues:
 * character ids from `characters.tsx`, accessory ids from `cosmetics.tsx`.
 * Extending the game with new rewards means editing only this table.
 */

export type LootKind = 'CHARACTER_CARD' | 'ACCESSORY_CARD'

export type PoolEntry = {
  id: string
  /** Coins granted instead when the player already owns this reward. */
  dupeCoins: number
}

export type RewardPool = {
  /** Probability of rolling a character card. The remainder rolls an accessory. */
  characterCardChance: number
  characterCards: PoolEntry[]
  accessories: PoolEntry[]
}

export const REWARD_POOL: RewardPool = {
  characterCardChance: 0,
  characterCards: [
    { id: 'spaghettino-fantasmino', dupeCoins: 900 },
  ],
  accessories: [
    { id: 're_crown', dupeCoins: 900 },
    { id: 'golden_armor', dupeCoins: 900 },
    { id: 'pinstripe_suit', dupeCoins: 450 },
    { id: 'mafia_sunglasses', dupeCoins: 450 },
    { id: 'chef_apron', dupeCoins: 180 },
    { id: 'chef_toque', dupeCoins: 180 },
    { id: 'italian_mustache', dupeCoins: 60 },
  ],
}

export type LootRoll = { kind: LootKind; entry: PoolEntry }

/**
 * One real random roll against the pool. `rng` is injectable so the roll can be
 * unit-tested and so nothing about it is faked at the presentation layer.
 */
export function rollLoot(pool: RewardPool = REWARD_POOL, rng: () => number = Math.random): LootRoll {
  const characterCard = pool.characterCards.length > 0 && rng() < pool.characterCardChance
  const list = characterCard ? pool.characterCards : pool.accessories
  const entry = list[Math.floor(rng() * list.length)] ?? list[0]
  return { kind: characterCard ? 'CHARACTER_CARD' : 'ACCESSORY_CARD', entry }
}
