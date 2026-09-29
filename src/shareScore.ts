/**
 * Score-card image for the game-over share button.
 * The card is drawn before the click so sharing and downloading stay inside
 * the browser's user gesture. The portrait is the same SVG sprite the home
 * screen and the match use.
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { characterPortraitPath } from "./art/portraits"
import { characterById } from "./characters"
import { CharacterComposite, cosmeticById, measureFitScale } from "./cosmetics"

const CARD = 1080
const spriteCache = new Map<string, HTMLImageElement>()

export type ScoreCard = {
  dataUrl: string
  file: File | null
  text: string
  url: string
}

export type ScoreCardSpec = {
  score: number
  coins: number
  characterName?: string
  characterId?: string
  equipped?: Record<string, string>
  portrait?: CanvasImageSource | null
}

export function drawScoreCard(spec: ScoreCardSpec): ScoreCard {
  const text = shareLine(spec.score, spec.characterName ?? "")
  const url = playUrl()
  const cached = spec.characterId ? spriteCache.get(spriteKey(spec.characterId, spec.equipped)) : undefined
  const portrait = spec.portrait ?? cached ?? null
  spec = portrait && portrait !== spec.portrait ? { ...spec, portrait } : spec
  try {
    const canvas = document.createElement("canvas")
    canvas.width = CARD
    canvas.height = CARD
    const ctx = canvas.getContext("2d")
    if (!ctx) return { dataUrl: "", file: null, text, url }
    paintCard(ctx, spec)
    const dataUrl = canvas.toDataURL("image/png")
    return { dataUrl, file: dataUrlToFile(dataUrl), text, url }
  } catch (err) {
    console.warn("Score card render failed:", err)
    return { dataUrl: "", file: null, text, url }
  }
}

/**
 * Loads the selected character, draws it, then exports the PNG.
 * `toDataURL` runs only after the sprite's load promise settles.
 */
export async function prepareScoreCard(spec: ScoreCardSpec): Promise<ScoreCard> {
  const charId = spec.characterId || "mozzarella"
  const equipped = spec.equipped ?? {}
  try {
    const portrait = spec.portrait ?? await loadCharacterSprite(charId, equipped)
    return drawScoreCard({ ...spec, characterId: charId, equipped, portrait })
  } catch (err) {
    console.warn("Score card render failed:", err)
    return drawScoreCard({ ...spec, characterId: charId, equipped, portrait: null })
  }
}

/** Starts the card as soon as the game-over screen appears. */
export function preloadScoreCard(spec: ScoreCardSpec, onReady: (card: ScoreCard) => void): () => void {
  let alive = true
  void prepareScoreCard(spec).then((card) => {
    if (alive) onReady(card)
  })
  return () => {
    alive = false
  }
}

/** Copies the clickable score line. Call this synchronously inside the click, before any canvas work. */
export function copyScoreMessage(score: number, characterName?: string): string {
  const text = shareLine(score, characterName ?? "")
  copyShareText(text)
  return text
}

/**
 * Downloads the PNG, or opens the share sheet when the browser can share that file.
 * Never changes the button label and never throws.
 */
export function presentScoreCard(card: ScoreCard): void {
  try {
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean
      share?: (data: ShareData) => Promise<void>
    }
    const url = card.url || playUrl()
    const fileData: ShareData | null = card.file
      ? { files: [card.file], title: "Pascapoli", text: card.text, url }
      : null
    if (fileData && typeof nav.share === "function" && canShare(nav, fileData)) {
      nav.share(fileData).catch(() => {})
      return
    }
    downloadCard(card)
  } catch (err) {
    console.warn("Score card share failed:", err)
  }
}

function canShare(nav: Navigator & { canShare?: (data?: ShareData) => boolean }, data: ShareData): boolean {
  if (typeof nav.canShare !== "function") return false
  try {
    return nav.canShare(data)
  } catch {
    return false
  }
}

function shareLine(score: number, characterName: string): string {
  const name = characterName || "Mozzarella"
  return `🎮 Can you beat my score of ${score} with ${name} in Pascapoli? Play now: ${playUrl()}`
}

const PUBLIC_GAME_URL = "https://pascapoli.onrender.com/"

/** Fully qualified play link, always with a protocol and a trailing slash. */
function playUrl(): string {
  if (typeof window === "undefined") return PUBLIC_GAME_URL
  const origin = window.location.origin
  const host = window.location.hostname
  const local = !host || host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || isPrivateHost(host)
  if (local) return PUBLIC_GAME_URL
  if (/^https?:\/\//i.test(origin)) return origin.endsWith("/") ? origin : `${origin}/`
  const protocol = window.location.protocol === "https:" ? "https:" : "http:"
  return window.location.host ? `${protocol}//${window.location.host}/` : PUBLIC_GAME_URL
}

function isPrivateHost(host: string): boolean {
  return host === "localhost"
    || host.endsWith(".local")
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
}

function downloadCard(card: ScoreCard): void {
  if (!card.dataUrl) return
  try {
    const link = document.createElement("a")
    link.href = card.dataUrl
    link.download = "pascapoli-score.png"
    link.style.display = "none"
    document.body.appendChild(link)
    link.click()
    link.remove()
  } catch (err) {
    console.warn("Score card download failed:", err)
  }
}

function copyShareText(value: string): void {
  try {
    const textarea = document.createElement("textarea")
    textarea.value = value
    textarea.style.position = "fixed"
    textarea.style.left = "-9999px"
    textarea.style.top = "-9999px"
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    document.execCommand("copy")
    document.body.removeChild(textarea)
  } catch (err) {
    console.warn("Fallback copy error:", err)
  }
  navigator.clipboard?.writeText(value).catch(() => {})
}

function paintCard(ctx: CanvasRenderingContext2D, spec: ScoreCardSpec) {
  const background = ctx.createRadialGradient(CARD * 0.5, CARD * 0.28, 80, CARD * 0.5, CARD * 0.55, CARD * 0.72)
  background.addColorStop(0, "#3a2460")
  background.addColorStop(1, "#100818")
  ctx.fillStyle = background
  ctx.fillRect(0, 0, CARD, CARD)

  roundRect(ctx, 36, 36, CARD - 72, CARD - 72, 48)
  ctx.strokeStyle = "#ffd24d"
  ctx.lineWidth = 8
  ctx.stroke()

  ctx.textAlign = "center"
  ctx.fillStyle = "#ffd24d"
  ctx.font = "700 72px Fredoka, Nunito, sans-serif"
  ctx.fillText("PASCAPOLI", CARD / 2, 150)

  const cx = CARD / 2
  const cy = 390
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, 150, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  ctx.fillStyle = "#241433"
  ctx.fillRect(cx - 150, cy - 150, 300, 300)
  const portrait = untaintedPortrait(spec.portrait)
  if (portrait) {
    try {
      ctx.drawImage(portrait, cx - 150, cy - 150, 300, 300)
    } catch (err) {
      console.warn("Score card portrait skipped:", err)
    }
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(cx, cy, 150, 0, Math.PI * 2)
  ctx.strokeStyle = "#8ec5ff"
  ctx.lineWidth = 8
  ctx.stroke()

  if (spec.characterName) {
    ctx.fillStyle = "#ffffff"
    fitFont(ctx, spec.characterName, 36, 900)
    ctx.fillText(spec.characterName, cx, 590)
  }

  ctx.fillStyle = "#8ec5ff"
  ctx.font = "700 34px Fredoka, Nunito, sans-serif"
  ctx.fillText("SCORE", cx, 670)

  ctx.fillStyle = "#ffffff"
  const scoreText = String(spec.score)
  fitFont(ctx, scoreText, 150, 900, 800)
  ctx.fillText(scoreText, cx, 820)

  ctx.fillStyle = "#ffe6a3"
  ctx.font = "700 42px Fredoka, Nunito, sans-serif"
  ctx.fillText(`+${spec.coins} coins`, cx, 890)

  ctx.fillStyle = "#6ee7a8"
  ctx.font = "700 40px Fredoka, Nunito, sans-serif"
  ctx.fillText("Can you beat my score?", cx, 970)

  const link = playUrl()
  ctx.fillStyle = "rgba(255,255,255,0.85)"
  fitFont(ctx, link, 28, 900, 600)
  ctx.fillText(link, cx, 1020)
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number, weight = 700) {
  let next = size
  ctx.font = `${weight} ${next}px Fredoka, Nunito, sans-serif`
  while (next > 28 && ctx.measureText(text).width > maxWidth) {
    next -= 4
    ctx.font = `${weight} ${next}px Fredoka, Nunito, sans-serif`
  }
}

function untaintedPortrait(portrait: CanvasImageSource | null | undefined): HTMLImageElement | null {
  if (!(portrait instanceof HTMLImageElement)) return null
  if (!portrait.complete || portrait.naturalWidth === 0) return null
  if (!portrait.src.startsWith("data:")) return null
  return portrait
}

function spriteKey(charId: string, equipped?: Record<string, string>): string {
  return `${charId}:${JSON.stringify(equipped ?? {})}`
}

/**
 * Same sprite the home screen draws. PNG portraits are loaded from their real
 * file. SVG characters (Mozzarella and the rest) are rasterized, with any
 * nested image files inlined so the canvas can paint them.
 */
async function loadCharacterSprite(charId: string, equipped: Record<string, string>): Promise<HTMLImageElement | null> {
  const key = spriteKey(charId, equipped)
  const cached = spriteCache.get(key)
  if (cached && cached.complete && cached.naturalWidth > 0) return cached

  const svgUrl = await characterSpriteUrl(charId, equipped)
  const svgImage = svgUrl ? await loadImage(svgUrl) : null
  if (svgUrl?.startsWith("blob:")) URL.revokeObjectURL(svgUrl)
  if (svgImage && imageHasPixels(svgImage)) {
    spriteCache.set(key, svgImage)
    return svgImage
  }

  const direct = directSpriteUrl(charId, equipped)
  if (direct) {
    const png = await loadImage(direct)
    if (png && png.naturalWidth > 0) {
      spriteCache.set(key, png)
      return png
    }
  }

  if (svgImage && svgImage.naturalWidth > 0) {
    spriteCache.set(key, svgImage)
    return svgImage
  }
  return null
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  const dataUrl = src.startsWith("data:") ? Promise.resolve(src) : fetchAsDataUrl(src)
  return dataUrl.then((inline) => {
    if (!inline?.startsWith("data:")) return null
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = inline
    })
  })
}

async function fetchAsDataUrl(src: string): Promise<string | null> {
  try {
    const response = await fetch(src)
    if (!response.ok) return null
    return await blobToDataUrl(await response.blob())
  } catch (err) {
    console.warn("Character image inline failed:", err)
    return null
  }
}

function imageHasPixels(img: HTMLImageElement): boolean {
  try {
    const probe = document.createElement("canvas")
    probe.width = 24
    probe.height = 24
    const ctx = probe.getContext("2d", { willReadFrequently: true })
    if (!ctx) return img.naturalWidth > 0
    ctx.drawImage(img, 0, 0, 24, 24)
    const data = ctx.getImageData(0, 0, 24, 24).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 12) return true
    }
    return false
  } catch {
    return false
  }
}

function directSpriteUrl(charId: string, equipped: Record<string, string>): string | null {
  const wearingWings = Object.values(equipped).some((id) => {
    const item = cosmeticById(id)
    return item?.slot === "wings" && item.anchor === "back"
  })
  const alt = characterById(charId).altBaseSprite
  const path = wearingWings && alt ? `/characters/${alt}` : characterPortraitPath(charId)
  if (!path || typeof window === "undefined") return null
  return new URL(path, window.location.origin).href
}

async function characterSpriteUrl(charId: string, equipped: Record<string, string>): Promise<string | null> {
  try {
    const fitScale = measureFitScale(charId, equipped)
    const markup = renderToStaticMarkup(createElement(CharacterComposite, { charId, equipped, fitScale }))
    const opened = markup.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
      const cleaned = String(attrs)
        .replace(/\sxmlns="[^"]*"/gi, "")
        .replace(/\s(?:width|height)="[^"]*"/gi, "")
      return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"${cleaned}>`
    })
    const svg = await inlineExternalImages(opened)
    return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }))
  } catch (err) {
    console.warn("Character sprite failed:", err)
    return null
  }
}

async function inlineExternalImages(svg: string): Promise<string> {
  const found = [...svg.matchAll(/\b(?:href|xlink:href)="([^"]+)"/gi)].map((match) => match[1])
  const unique = [...new Set(found)].filter((href) => href && !href.startsWith("data:") && !href.startsWith("#"))
  let next = svg
  for (const href of unique) {
    try {
      const abs = new URL(href, window.location.origin).href
      const response = await fetch(abs)
      if (!response.ok) continue
      const dataUrl = await blobToDataUrl(await response.blob())
      next = next.split(href).join(dataUrl)
    } catch (err) {
      console.warn("Character image inline failed:", href, err)
    }
  }
  return next
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function dataUrlToFile(dataUrl: string): File | null {
  try {
    const comma = dataUrl.indexOf(",")
    if (comma < 0) return null
    const binary = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new File([bytes], "pascapoli-score.png", { type: "image/png" })
  } catch {
    return null
  }
}
