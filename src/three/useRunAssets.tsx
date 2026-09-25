import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { CharacterComposite, measureFitScale } from '../cosmetics'
import type { Obstacle } from '../obstacles'
import { svgToTexture } from './svgTexture'

/** The in-run coin, identical to the one drawn by the 2D game. */
function CoinArt() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill="#f5a623" />
      <circle cx="12" cy="12" r="8.5" fill="#ffcf4d" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="#f5a623" strokeWidth="1.4" />
      <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#b26b00">$</text>
    </svg>
  )
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 64 64">
      <rect x="10" y="26" width="44" height="30" rx="4" fill="#C2185B" />
      <rect x="8" y="18" width="48" height="12" rx="3" fill="#E91E63" />
      <rect x="28" y="18" width="8" height="38" fill="#FFD700" />
      <path d="M32 18 Q18 4 12 16 Q24 14 32 18 Z" fill="#FFD700" />
      <path d="M32 18 Q46 4 52 16 Q40 14 32 18 Z" fill="#FFD700" />
    </svg>
  )
}

export type RunAssets = {
  /** Equipped shaft art, wrapped once around the cylinder. */
  shaft: THREE.Texture
  /**
   * Equipped cap art including the cute face, kept as a flat plate so the
   * face looks at the camera without wrapping around the flange.
   */
  capFace: THREE.Texture
  character: THREE.Texture
  coin: THREE.Texture
  gift: THREE.Texture
  capEndColor: THREE.Color
  groundColors: [THREE.Color, THREE.Color]
}

/** The last colour stop of the background gradient is the one nearest the ground. */
function horizonColor(backgroundStyle: string): THREE.Color {
  const stops = backgroundStyle.match(/#[0-9a-f]{6}/gi)
  return new THREE.Color(stops?.[stops.length - 1] ?? '#ffffff')
}

/**
 * Builds every texture a 3D run needs from the player's currently equipped
 * pipe design and character. Returns null until they are ready.
 */
export function useRunAssets(environment: Obstacle, charId: string, equipped: Record<string, string>) {
  const [assets, setAssets] = useState<RunAssets | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Equipped accessories arrive as an object; key on its contents so a new
  // object with the same items does not rebuild every texture.
  const equippedKey = JSON.stringify(equipped)

  useEffect(() => {
    let cancelled = false
    const built: THREE.Texture[] = []
    setAssets(null)
    setError(null)

    const { Piece, Cap } = environment
    Promise.all([
      svgToTexture(<Piece />, { width: 512, height: 1024, repeatX: 1 }),
      // Flat, no wrap — the face must stay undistorted on a front-facing plate.
      svgToTexture(<Cap />, { width: 1024, height: 384 }),
      svgToTexture(<CharacterComposite charId={charId} equipped={JSON.parse(equippedKey)} fitScale={measureFitScale(charId, JSON.parse(equippedKey))} />, {
        width: 512,
        height: 512,
      }),
      svgToTexture(<CoinArt />, { width: 256, height: 256 }),
      svgToTexture(<GiftIcon />, { width: 256, height: 256 }),
    ])
      .then(([shaft, capFace, character, coin, gift]) => {
        if (cancelled) {
          ;[shaft, capFace, character, coin, gift].forEach((texture) => texture.dispose())
          return
        }
        built.push(shaft, capFace, character, coin, gift)
        const horizon = horizonColor(environment.backgroundStyle)
        const swatch = new THREE.Color(environment.swatch)
        setAssets({
          shaft,
          capFace,
          character,
          coin,
          gift,
          capEndColor: swatch,
          groundColors: [horizon.clone().lerp(swatch, 0.55), horizon.clone().lerp(swatch, 0.32)],
        })
      })
      .catch((cause: unknown) => {
        console.error('[3d] asset build failed:', cause)
        if (!cancelled) setError('Could not load 3D assets.')
      })

    return () => {
      cancelled = true
      built.forEach((texture) => texture.dispose())
    }
  }, [environment, charId, equippedKey])

  return { assets, error }
}
