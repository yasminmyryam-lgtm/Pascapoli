import { ART_H, ART_OX, ART_SCALE, ART_W } from './kit'

/**
 * Uniform visual bounds for every character mark.
 *
 * The gameplay hitbox never reads these numbers — `Game.tsx` PHYSICS is a
 * fixed circle. This file only decides how the SVG art is scaled so a tall
 * hat or a naturally large body cannot grow the on-screen sprite.
 */
export const FIT_MAX_W = ART_W
export const FIT_MAX_H = ART_H
export const FIT_PAD = 6

/** Body center in the 120×132 pad, mapped into the 256×256 viewBox. */
export const FIT_PIVOT = {
  x: ART_OX + 60 * ART_SCALE,
  y: 66 * ART_SCALE,
}

const cache = new Map<string, number>()

export function fitCacheKey(charId: string, equipped: Record<string, string>): string {
  const worn = Object.entries(equipped)
    .filter(([, id]) => id)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slot, id]) => `${slot}:${id}`)
    .join('|')
  return `${charId}::${worn}`
}

export function peekFitScale(key: string): number | undefined {
  return cache.get(key)
}

export function rememberFitScale(key: string, scale: number): number {
  cache.set(key, scale)
  return scale
}

/** Uniform scale-down so `bbox` fits inside the standard box. Never scales up. */
export function fitScaleFromBBox(bbox: { width: number; height: number }): number {
  if (!(bbox.width > 0) || !(bbox.height > 0)) return 1
  const maxW = FIT_MAX_W - FIT_PAD * 2
  const maxH = FIT_MAX_H - FIT_PAD * 2
  return Math.min(1, maxW / bbox.width, maxH / bbox.height)
}

export function fitTransform(scale: number): string | undefined {
  if (scale >= 0.999) return undefined
  const { x, y } = FIT_PIVOT
  return `translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`
}
