/**
 * Shared monetization rules. The Node server is the authority for diamond
 * deductions; the client uses the same formula only to display prices.
 */

export const AD_REVIVE_MAX = 3
export const FIRST_DIAMOND_REVIVE_COST = 4

/** 1-based revive number in the current run. Revives 1–3 are ad-gated (cost 0). */
export function diamondReviveCost(reviveNumber: number): number {
  const n = Math.floor(Number(reviveNumber))
  if (!Number.isFinite(n) || n < 4) return 0
  return FIRST_DIAMOND_REVIVE_COST * 2 ** (n - 4)
}

export function isAdRevive(reviveNumber: number): boolean {
  const n = Math.floor(Number(reviveNumber))
  return n >= 1 && n <= AD_REVIVE_MAX
}

export type WheelPayout = {
  coins: number
  diamonds: number
  xp: number
  items: string[]
}

export type ChestPayout = {
  kind: 'CHARACTER_CARD' | 'ACCESSORY_CARD'
  id: string
  coins: number
  diamonds: number
  copies: number
}

export function scalePayout<T extends { coins: number; diamonds: number }>(payout: T, doubled: boolean): T {
  const m = doubled ? 2 : 1
  return { ...payout, coins: payout.coins * m, diamonds: payout.diamonds * m }
}
