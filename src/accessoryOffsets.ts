/**
 * Where one accessory sits on one character.
 * `x` and `y` are added in that accessory's own space (the 120×132 pad, or
 * 256×256 presentation pixels for viewBox art). `scale` multiplies the
 * accessory only. Missing pairs use `{ x: 0, y: 0, scale: 1, rotation: 0 }`.
 */
export type AccessoryOffset = {
  x: number
  y: number
  scale: number
  rotation: number
}

const IDENTITY: AccessoryOffset = { x: 0, y: 0, scale: 1, rotation: 0 }

/**
 * character id → accessory id → placement.
 * Anchors still provide the rough joint; these values are the per-body nudge.
 */
export const accessoryOffsets: Record<string, Record<string, AccessoryOffset>> = {
  mozzarella: {
    angel_wings: { x: 0, y: 4, scale: 0.92, rotation: 0 },
    galaxy_wings: { x: 0, y: 4, scale: 0.92, rotation: 0 },
  },
  espressino: {
    re_crown: { x: 0, y: -6, scale: 0.92, rotation: 0 },
    crown_hat: { x: 0, y: -4, scale: 0.9, rotation: 0 },
  },
  'fursecina-fatina': {
    angel_wings: { x: 0, y: 12, scale: 0.7, rotation: 0 },
    galaxy_wings: { x: 0, y: 12, scale: 0.7, rotation: 0 },
    halo: { x: 0, y: -4, scale: 0.85, rotation: 0 },
  },
  'donutina-fantina': {
    angel_wings: { x: 0, y: 10, scale: 0.74, rotation: 0 },
    galaxy_wings: { x: 0, y: 10, scale: 0.74, rotation: 0 },
    halo: { x: 0, y: -2, scale: 0.88, rotation: 0 },
  },
  'donutino-batutino': {
    angel_wings: { x: 0, y: 8, scale: 0.8, rotation: 0 },
    galaxy_wings: { x: 0, y: 8, scale: 0.8, rotation: 0 },
    re_crown: { x: 0, y: 4, scale: 0.86, rotation: 0 },
  },
  'spaghettino-fantasmino': {
    angel_wings: { x: 0, y: 6, scale: 0.78, rotation: 0 },
    galaxy_wings: { x: 0, y: 6, scale: 0.78, rotation: 0 },
    re_crown: { x: 0, y: -8, scale: 0.8, rotation: 0 },
  },
}

export function offsetFor(charId: string, accessoryId: string): AccessoryOffset {
  return accessoryOffsets[charId]?.[accessoryId] ?? IDENTITY
}
