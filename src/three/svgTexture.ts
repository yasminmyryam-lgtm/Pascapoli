import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as THREE from 'three'

/**
 * Rasterises a React SVG element into a three.js texture.
 *
 * This is how the 3D view stays visually identical to 2D: it never redraws a
 * pipe or character, it renders the very same components the 2D game and the
 * shop use (with the player's equipped accessories), so any new shop item
 * works in 3D without extra art.
 */

type Options = {
  width: number
  height: number
  /** Replaces the root viewBox — used to pad art whose accessories overflow it. */
  viewBox?: string
  /** Wrap horizontally, for textures that go around a cylinder. */
  repeatX?: number
}

/** Rewrites only the root <svg> tag so it rasterises at an exact pixel size. */
function prepareMarkup(markup: string, { width, height, viewBox }: Options): string {
  return markup.replace(/^<svg\b[^>]*>/, (tag) => {
    let next = tag
      // Existing percentage sizes would duplicate the attributes below, which
      // is invalid XML and makes the image silently fail to load.
      .replace(/\s(width|height|class)="[^"]*"/g, '')
    if (viewBox) next = next.replace(/\sviewBox="[^"]*"/, ` viewBox="${viewBox}"`)
    if (!/\sxmlns=/.test(next)) next = next.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    return next.replace('<svg', `<svg width="${width}" height="${height}"`)
  })
}

export async function svgToTexture(element: ReactElement, options: Options): Promise<THREE.Texture> {
  const markup = prepareMarkup(renderToStaticMarkup(element), options)

  const image = new Image()
  image.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('SVG texture failed to load'))
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup)
  })

  // Drawing through a canvas gives a fixed-size bitmap every browser accepts
  // as a WebGL texture; some reject SVG images uploaded directly.
  const canvas = document.createElement('canvas')
  canvas.width = options.width
  canvas.height = options.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  ctx.drawImage(image, 0, 0, options.width, options.height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  if (options.repeatX) {
    texture.wrapS = THREE.RepeatWrapping
    texture.repeat.set(options.repeatX, 1)
  }
  texture.needsUpdate = true
  return texture
}
