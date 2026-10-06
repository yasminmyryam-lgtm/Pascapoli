import type { BodyFn, CharacterAnchors } from './kit'
import { makeAnchors } from './kit'

/** Public PNGs in `public/characters`. Uses the Vite base so CrazyGames subpaths resolve. */
export function characterPublicSrc(file: string): string {
  const base = import.meta.env.BASE_URL || './'
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}characters/${file.replace(/^\//, '')}`
}

const PORTRAIT_FILES: Record<string, string> = {
  'olive-ocarina': 'olive-ocarina.png',
  'fursecino-fortino': 'Fursecino-Fortino.png',
  'fursecina-fatina': 'Fursecina-Fatina.png',
  'donutino-batutino': 'Donutino-Batutino.png',
  'donutina-fantina': 'Donutina-Fantina.png',
  'risotto-roboto': 'risotto-roboto.png',
  'pestino-pinguino': 'pestino-pinguino.png',
  'llama-lasagna': 'lama-lasagna.png',
  'spaghettino-fantasmino': 'Spaghettino-Fantasmino.png',
}

function portrait(file: string): BodyFn {
  return () => (
    <image
      href={characterPublicSrc(file)}
      x={0}
      y={6}
      width={120}
      height={120}
      preserveAspectRatio="xMidYMid meet"
    />
  )
}

export const PORTRAIT_BODIES: Record<string, BodyFn> = Object.fromEntries(
  Object.entries(PORTRAIT_FILES).map(([id, file]) => [id, portrait(file)]),
)

/** Portrait PNG for the home screen, the match, and score cards, when this character has one. */
export function characterPortraitPath(charId: string): string | null {
  const file = PORTRAIT_FILES[charId]
  return file ? characterPublicSrc(file) : null
}

export const PORTRAIT_ANCHORS: Record<string, CharacterAnchors> = {
  'olive-ocarina': makeAnchors({
    head: { x: 60, y: 22, scale: 1.05 },
    face: { x: 60, y: 58, scale: 1.1 },
    body: { x: 60, y: 92 },
    chest: { x: 60, y: 82 },
    back: { x: 60, y: 70 },
    feet: { x: 60, y: 118 },
  }),
  'fursecino-fortino': makeAnchors({
    head: { x: 60, y: 18, scale: 1.15 },
    face: { x: 60, y: 48, scale: 1.15 },
    body: { x: 60, y: 88, scale: 1.2 },
    chest: { x: 60, y: 78, scale: 1.1 },
    back: { x: 60, y: 70 },
    feet: { x: 60, y: 118 },
  }),
  'fursecina-fatina': makeAnchors({
    head: { x: 60, y: 28, scale: 1 },
    face: { x: 60, y: 62, scale: 1.05 },
    body: { x: 60, y: 90 },
    chest: { x: 60, y: 82 },
    back: { x: 60, y: 72 },
    feet: { x: 60, y: 112 },
  }),
  'donutino-batutino': makeAnchors({
    head: { x: 60, y: 28, scale: 0.95 },
    face: { x: 60, y: 62, scale: 1 },
    body: { x: 60, y: 88 },
    chest: { x: 60, y: 80 },
    back: { x: 60, y: 70 },
    feet: { x: 60, y: 112 },
  }),
  'donutina-fantina': makeAnchors({
    head: { x: 60, y: 32, scale: 0.95 },
    face: { x: 60, y: 62, scale: 1 },
    body: { x: 60, y: 88 },
    chest: { x: 60, y: 80 },
    back: { x: 60, y: 70 },
    feet: { x: 60, y: 112 },
  }),
  'risotto-roboto': makeAnchors({
    head: { x: 60, y: 22, scale: 1 },
    face: { x: 60, y: 40, scale: 0.95 },
    body: { x: 60, y: 88, scale: 1.1 },
    chest: { x: 60, y: 78 },
    back: { x: 60, y: 70 },
    feet: { x: 60, y: 118 },
  }),
  'pestino-pinguino': makeAnchors({
    head: { x: 60, y: 20, scale: 1.05 },
    face: { x: 60, y: 48, scale: 1.05 },
    body: { x: 60, y: 90, scale: 1.1 },
    chest: { x: 60, y: 80 },
    back: { x: 60, y: 70 },
    feet: { x: 60, y: 118 },
  }),
  'llama-lasagna': makeAnchors({
    head: { x: 70, y: 18, scale: 1.05 },
    face: { x: 72, y: 42, scale: 1 },
    body: { x: 52, y: 92, scale: 1.15 },
    chest: { x: 52, y: 80 },
    back: { x: 56, y: 70 },
    feet: { x: 56, y: 118 },
  }),
  'spaghettino-fantasmino': makeAnchors({
    head: { x: 60, y: 16, scale: 1 },
    face: { x: 60, y: 52, scale: 1.05 },
    body: { x: 60, y: 88, scale: 1.1 },
    chest: { x: 60, y: 78 },
    back: { x: 60, y: 70 },
    feet: { x: 60, y: 118 },
  }),
}
