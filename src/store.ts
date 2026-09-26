import { useCallback, useSyncExternalStore } from 'react'
import { CARD_POOL, CHARACTER_IDS, CHARACTERS, cardsRequired } from './characters'
import { isFounderEmail } from './founder'
import { rollLoot } from './lootbox'
import { OBSTACLES } from './obstacles'

export type Daily = { day: string; games: number; coins: number; bestScore: number; claimed: string[] }
export type Streak = { count: number; lastDay: string }
export type Equipped = Record<string, Record<string, string>>

export type GameState = {
  coins: number
  diamonds: number
  xp: number
  best: number
  totalGames: number
  owned: string[]
  ownedObstacles: string[]
  selected: string
  obstacle: string
  lastSpin: number
  cosmetics: string[]
  equipped: Equipped
  /** Chest loot: MYTHIC character id -> character cards collected so far. */
  cards: Record<string, number>
  daily: Daily
  streak: Streak
}

/**
 * What one chest reveals. A real roll against `REWARD_POOL` decides the branch,
 * and the reward is committed to the save before the reveal UI ever sees it.
 */
export type ChestDrop =
  | { kind: 'CHARACTER_CARD'; charId: string; have: number; need: number; unlocked: boolean }
  | { kind: 'ACCESSORY_CARD'; accessoryId: string; isNew: boolean; dupeCoins: number }

/** @deprecated kept as an alias so older call sites keep compiling. */
export type CardDrop = ChestDrop

export type GameReward = { totalReward: number; xpGained: number; isNewBest: boolean; collected: number; bonus: number }

/**
 * v4 keys saves by Supabase user id instead of email. Older `v3.<email>` saves
 * are intentionally left on disk, untouched and unread — Phase 1 starts every
 * account from `DEFAULT_STATE` for a clean launch database.
 *
 * This whole module remains the local cache. Phase 2 makes the server profile
 * authoritative for progression.
 */
const KEY = 'pastapoli.save.v4'

function getTodayStr() { return new Date().toISOString().split('T')[0] }
function getYesterdayStr() { 
  const d = new Date(); d.setDate(d.getDate() - 1); 
  return d.toISOString().split('T')[0] 
}

const DEFAULT_STATE: GameState = {
  coins: 100, diamonds: 10, xp: 0, best: 0, totalGames: 0,
  owned: ['mozzarella'], ownedObstacles: ['woodo'],
  selected: 'mozzarella', obstacle: 'woodo', lastSpin: 0,
  cosmetics: [], equipped: {}, cards: {},
  daily: { day: getTodayStr(), games: 0, coins: 0, bestScore: 0, claimed: [] },
  streak: { count: 0, lastDay: '' },
}

/**
 * Which save slot is live. Set from the authenticated Supabase user id by
 * `App`, so the store never has to know about the auth provider.
 */
let activeSessionId = 'guest'
let founder = false
let snapshot: GameState = DEFAULT_STATE

export function getActiveSessionId(): string {
  return activeSessionId
}

export function isFounder(): boolean {
  return founder
}

/**
 * Points the store at a different save slot and reloads it. Passing `null`
 * (sign-out) falls back to the throwaway `guest` slot. Email only sets the
 * founder overlay — it is never written into the save file.
 */
export function setActiveSession(userId: string | null, email?: string | null): void {
  const next = userId ?? 'guest'
  const nextFounder = isFounderEmail(email)
  if (next === activeSessionId && nextFounder === founder) return
  activeSessionId = next
  founder = nextFounder
  forceStoreReload()
}

/** Live catalog unlocks for the founder — any future roster/theme id is included. */
function applyFounderUnlocks(s: GameState): GameState {
  if (!founder) return s
  return {
    ...s,
    owned: CHARACTERS.map((c) => c.id),
    ownedObstacles: OBSTACLES.map((o) => o.id),
    cards: Object.fromEntries(CARD_POOL.map((id) => [id, cardsRequired(id)])),
  }
}

function refreshSnapshot() {
  snapshot = applyFounderUnlocks(state)
}

/** Keeps only known mythic ids and clamps counts to their required amount. */
function sanitizeCards(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const id of CARD_POOL) {
    const v = (raw as Record<string, unknown>)[id]
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0
    if (n > 0) out[id] = Math.min(n, cardsRequired(id))
  }
  return out
}

function sanitizeOwned(raw: unknown): string[] {
  const ids = Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string' && CHARACTER_IDS.has(id))
    : []
  if (!ids.includes('mozzarella')) ids.unshift('mozzarella')
  return [...new Set(ids)]
}

function sanitizeSelected(raw: unknown, owned: string[]): string {
  return typeof raw === 'string' && owned.includes(raw) ? raw : 'mozzarella'
}

function sanitizeEquipped(raw: unknown): Equipped {
  if (!raw || typeof raw !== 'object') return {}
  const out: Equipped = {}
  for (const [charId, slots] of Object.entries(raw as Record<string, unknown>)) {
    if (!CHARACTER_IDS.has(charId) || !slots || typeof slots !== 'object') continue
    out[charId] = { ...(slots as Record<string, string>) }
  }
  return out
}

function parseAndValidateState(): GameState {
  if (typeof localStorage === 'undefined') return DEFAULT_STATE
  try {
    const sessionId = getActiveSessionId()
    const raw = localStorage.getItem(`${KEY}.${sessionId}`)
    if (!raw) return DEFAULT_STATE
    
    const parsed = JSON.parse(raw)
    const today = getTodayStr()
    const yesterday = getYesterdayStr()
    
    let currentDaily = parsed.daily || DEFAULT_STATE.daily
    let currentStreak = parsed.streak || DEFAULT_STATE.streak

    if (currentDaily.day !== today) {
      currentDaily = { day: today, games: 0, coins: 0, bestScore: 0, claimed: [] }
      if (currentStreak.lastDay === yesterday) {
        currentStreak = { count: currentStreak.count + 1, lastDay: today }
      } else if (currentStreak.lastDay !== today) {
        currentStreak = { count: 0, lastDay: today }
      }
    }

    // Anti-cheat: clamp persisted numerics to non-negative, sane ceilings so a
    // hand-edited save file can't inject absurd balances/levels.
    const clampNum = (v: unknown, max: number) => {
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0
      return Math.max(0, Math.min(n, max))
    }

    const owned = sanitizeOwned(parsed.owned)
    return {
      ...DEFAULT_STATE,
      ...parsed,
      coins: clampNum(parsed.coins, 9_999_999),
      diamonds: clampNum(parsed.diamonds, 999_999),
      xp: clampNum(parsed.xp, 99_999_999),
      best: clampNum(parsed.best, 99_999),
      totalGames: clampNum(parsed.totalGames, 9_999_999),
      lastSpin: clampNum(parsed.lastSpin, Date.now() + 1),
      owned,
      selected: sanitizeSelected(parsed.selected, owned),
      ownedObstacles: Array.isArray(parsed.ownedObstacles) ? parsed.ownedObstacles : DEFAULT_STATE.ownedObstacles,
      cosmetics: Array.isArray(parsed.cosmetics) ? parsed.cosmetics : DEFAULT_STATE.cosmetics,
      equipped: sanitizeEquipped(parsed.equipped),
      cards: sanitizeCards(parsed.cards),
      daily: currentDaily,
      streak: currentStreak
    }
  } catch { return DEFAULT_STATE }
}

let state: GameState = parseAndValidateState()
refreshSnapshot()
const listeners = new Set<() => void>()

function emit() {
  try {
    const sessionId = getActiveSessionId()
    localStorage.setItem(`${KEY}.${sessionId}`, JSON.stringify(state))
  } catch {}
  refreshSnapshot()
  listeners.forEach((l) => l())
}

export function forceStoreReload() { state = parseAndValidateState(); emit() }

export function getDiamonds(): number {
  return state.diamonds
}

export function setState(patch: Partial<GameState> | ((s: GameState) => Partial<GameState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; emit()
}

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) }

export function useGameState(): GameState { return useSyncExternalStore(subscribe, () => snapshot, () => snapshot) }

export function levelInfo(xp: number) {
  let level = 1; let need = 100; let rem = xp
  while (rem >= need) { rem -= need; level++; need = 100 + (level - 1) * 60 }
  return { level, into: rem, need, pct: Math.max(0, Math.min(1, rem / need)) }
}

export function useActions() {
  const addCoins = useCallback((n: number) => setState((s) => ({ coins: Math.max(0, s.coins + n) })), [])
  const addXp = useCallback((n: number) => setState((s) => ({ xp: s.xp + n })), [])
  
  // Single source of truth for end-of-run rewards. `collectedCoins` are the coins
  // physically picked up during the run; the returned totalReward is EXACTLY what
  // gets added to the balance, so the Game Over screen and the wallet always match.
  const recordGame = useCallback((score: number, collectedCoins: number, mode: 'NORMAL'|'CHALLENGE'|'COOP' = 'NORMAL'): GameReward => {
    // --- Anti-cheat plausibility clamps (client-side guard) ---
    const safeScore = Math.max(0, Math.min(99999, Math.floor(Number.isFinite(score) ? score : 0)))
    // At most a handful of coins can be earned per pipe cleared, plus a small buffer.
    const maxPlausibleCollected = safeScore * 6 + 40
    const safeCollected = Math.max(0, Math.min(Math.floor(Number.isFinite(collectedCoins) ? collectedCoins : 0), maxPlausibleCollected))

    // Simple, fair, intuitive: Total Earned = Collected coins + Score.
    // 1 collected coin = 1 unit of currency; every point cleared = 1 coin.
    const collected = safeCollected
    const bonus = 0
    const totalReward = collected + safeScore
    const xpGained = Math.floor((20 + safeScore * 12) * (mode === 'CHALLENGE' ? 2.5 : 1))
    const isNewBest = safeScore > state.best

    setState((s) => ({
      xp: s.xp + xpGained,
      coins: s.coins + totalReward,
      best: Math.max(s.best, safeScore),
      totalGames: s.totalGames + 1,
      daily: {
        ...s.daily,
        games: s.daily.games + 1,
        bestScore: Math.max(s.daily.bestScore, safeScore),
        coins: s.daily.coins + totalReward,
      },
      streak: { ...s.streak, lastDay: getTodayStr() },
    }))

    return { totalReward, xpGained, isNewBest, collected, bonus }
  }, [])

  const claimMissionReward = useCallback((missionId: string, rewardCoins: number = 0, rewardXp: number = 0) => {
    setState((s) => {
      if (s.daily.claimed.includes(missionId)) return {}
      return { 
        coins: s.coins + rewardCoins, 
        xp: s.xp + rewardXp, 
        daily: { ...s.daily, claimed: [...s.daily.claimed, missionId] } 
      }
    })
  }, [])

  /**
   * Opens one chest. Rolls the configurable reward pool for real, then commits
   * the result to the save: a MYTHIC character card (unlocking the character
   * once the set is complete) or a premium accessory added to the inventory.
   * Duplicate accessories convert to coins instead of stacking.
   */
  const openChest = useCallback((): ChestDrop => {
    const roll = rollLoot()

    if (roll.kind === 'CHARACTER_CARD') {
      const charId = roll.entry.id
      const need = cardsRequired(charId)
      let drop: ChestDrop = { kind: 'CHARACTER_CARD', charId, have: 0, need, unlocked: false }
      setState((s) => {
        const have = Math.min((s.cards[charId] ?? 0) + 1, need)
        const unlocked = have >= need
        drop = { kind: 'CHARACTER_CARD', charId, have, need, unlocked }
        const cards = { ...s.cards, [charId]: have }
        if (unlocked && !s.owned.includes(charId)) return { cards, owned: [...s.owned, charId] }
        return { cards }
      })
      return drop
    }

    const accessoryId = roll.entry.id
    let drop: ChestDrop = { kind: 'ACCESSORY_CARD', accessoryId, isNew: true, dupeCoins: 0 }
    setState((s) => {
      if (s.cosmetics.includes(accessoryId)) {
        drop = { kind: 'ACCESSORY_CARD', accessoryId, isNew: false, dupeCoins: roll.entry.dupeCoins }
        return { coins: s.coins + roll.entry.dupeCoins }
      }
      drop = { kind: 'ACCESSORY_CARD', accessoryId, isNew: true, dupeCoins: 0 }
      return { cosmetics: [...s.cosmetics, accessoryId] }
    })
    return drop
  }, [])

  const buyCharacter = useCallback((id: string, price: number, currency: 'COINS'|'DIAMONDS' = 'COINS'): 'bought' | 'poor' | 'owned' => {
    let res: 'bought' | 'poor' | 'owned' = 'poor'
    if (founder) return 'owned'
    if (!CHARACTER_IDS.has(id)) return 'poor'
    // MYTHIC characters are card-only — never sellable for coins or diamonds.
    if (cardsRequired(id) > 0) return 'poor'
    setState((s) => {
      if (s.owned.includes(id)) { res = 'owned'; return {} }
      if (currency === 'DIAMONDS' && s.diamonds >= price) {
        res = 'bought'
        return { diamonds: s.diamonds - price, owned: [...s.owned, id], selected: id }
      }
      if (currency !== 'DIAMONDS' && s.coins >= price) {
        res = 'bought'
        return { coins: s.coins - price, owned: [...s.owned, id], selected: id }
      }
      return {}
    })
    return res
  }, [])

  const buyObstacle = useCallback((id: string, price: number, currency: 'COINS'|'DIAMONDS' = 'COINS'): 'bought' | 'poor' | 'owned' => {
    if (founder) return 'owned'
    let res: 'bought' | 'poor' | 'owned' = 'poor'
    setState((s) => {
      const obs = s.ownedObstacles || ['woodo']
      if (obs.includes(id)) { res = 'owned'; return {} }
      if (currency === 'COINS' && s.coins >= price) { res = 'bought'; return { coins: s.coins - price, ownedObstacles: [...obs, id], obstacle: id } }
      if (currency === 'DIAMONDS' && s.diamonds >= price) { res = 'bought'; return { diamonds: s.diamonds - price, ownedObstacles: [...obs, id], obstacle: id } }
      return {}
    })
    return res
  }, [])

  const buyCosmetic = useCallback((id: string, price: number): 'bought' | 'poor' | 'owned' => {
    if (founder) return 'owned'
    let res: 'bought' | 'poor' | 'owned' = 'poor'
    setState((s) => {
      if (s.cosmetics.includes(id)) { res = 'owned'; return {} }
      if (s.coins >= price) { res = 'bought'; return { coins: s.coins - price, cosmetics: [...s.cosmetics, id] } }
      return {}
    })
    return res
  }, [])

  /**
   * Rolls a chest without banking it, so the player can still watch ads to
   * double the drop before the save is written.
   */
  const previewChest = useCallback((): ChestDrop => {
    const roll = rollLoot()
    if (roll.kind === 'CHARACTER_CARD') {
      const charId = roll.entry.id
      const need = cardsRequired(charId)
      const have = Math.min((state.cards[charId] ?? 0) + 1, need)
      return { kind: 'CHARACTER_CARD', charId, have, need, unlocked: have >= need }
    }
    const accessoryId = roll.entry.id
    return {
      kind: 'ACCESSORY_CARD',
      accessoryId,
      isNew: !state.cosmetics.includes(accessoryId),
      dupeCoins: roll.entry.dupeCoins,
    }
  }, [])

  const applyChestDrop = useCallback((drop: ChestDrop, copies: number): ChestDrop => {
    const qty = Math.max(1, Math.min(2, Math.floor(copies)))
    let result = drop
    setState((s) => {
      if (drop.kind === 'CHARACTER_CARD') {
        const need = cardsRequired(drop.charId)
        const have = Math.min((s.cards[drop.charId] ?? 0) + qty, need)
        const unlocked = have >= need
        result = { kind: 'CHARACTER_CARD', charId: drop.charId, have, need, unlocked }
        const cards = { ...s.cards, [drop.charId]: have }
        if (unlocked && !s.owned.includes(drop.charId)) return { cards, owned: [...s.owned, drop.charId] }
        return { cards }
      }
      const id = drop.accessoryId
      const already = s.cosmetics.includes(id)
      if (!already) {
        const extra = Math.max(0, qty - 1)
        result = { kind: 'ACCESSORY_CARD', accessoryId: id, isNew: true, dupeCoins: extra * drop.dupeCoins }
        return { cosmetics: [...s.cosmetics, id], coins: s.coins + extra * drop.dupeCoins }
      }
      result = { kind: 'ACCESSORY_CARD', accessoryId: id, isNew: false, dupeCoins: drop.dupeCoins * qty }
      return { coins: s.coins + drop.dupeCoins * qty }
    })
    return result
  }, [])

  const addDiamonds = useCallback((n: number) => setState((s) => ({ diamonds: Math.max(0, s.diamonds + n) })), [])

  const grantCosmetic = useCallback((id: string) => {
    setState((s) => {
      if (s.cosmetics.includes(id)) return {}
      return { cosmetics: [...s.cosmetics, id] }
    })
  }, [])

  /** Equips into the slot, or unequips when the same item is already worn. */
  const equipCosmetic = useCallback((charId: string, slot: string, cosmeticId: string) => setState((s) => {
    const cur = s.equipped[charId] || {}
    const next = { ...cur }
    if (next[slot] === cosmeticId) delete next[slot]
    else next[slot] = cosmeticId
    return { equipped: { ...s.equipped, [charId]: next } }
  }), [])

  const unequipCosmetic = useCallback((charId: string, slot: string) => setState((s) => {
    const cur = s.equipped[charId] || {}
    if (!(slot in cur)) return {}
    const next = { ...cur }
    delete next[slot]
    return { equipped: { ...s.equipped, [charId]: next } }
  }), [])

  const selectCharacter = useCallback((id: string) => {
    if (!CHARACTER_IDS.has(id)) return
    setState({ selected: id })
  }, [])
  const selectObstacle = useCallback((id: string) => setState({ obstacle: id }), [])
  const setLastSpin = useCallback((ts: number) => setState({ lastSpin: ts }), [])

  return { addCoins, addXp, addDiamonds, recordGame, openChest, previewChest, applyChestDrop, buyCharacter, buyObstacle, buyCosmetic, grantCosmetic, equipCosmetic, unequipCosmetic, selectCharacter, selectObstacle, claimMissionReward, setLastSpin }
}

export function spinRemaining(lastSpin: number, now = Date.now()) { return Math.max(0, lastSpin + 86400000 - now) }