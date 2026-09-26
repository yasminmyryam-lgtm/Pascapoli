export type RelayRun = {
  relayId: string
  senderId: string
  charId: string
  themeId: string
  startScore: number
  startCoins: number
  playedIds: string[]
}

const ID_OK = /^[A-Za-z0-9_-]{1,80}$/

export function normalizeIds(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of ids) {
    const id = raw.trim()
    if (!ID_OK.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= 40) break
  }
  return out
}

/** True when this account already flew this chain, including the current sender. */
export function relayBlocks(run: RelayRun, userId: string): boolean {
  return run.senderId === userId || run.playedIds.includes(userId)
}

/** Ids stamped onto the next link: everyone so far, plus the player sharing now. */
export function chainPlayedIds(previous: RelayRun | null, nextSenderId: string): string[] {
  return normalizeIds([
    ...(previous?.playedIds ?? []),
    ...(previous ? [previous.senderId] : []),
    nextSenderId,
  ])
}

function nonNegInt(value: string | null, max: number) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, max)
}

const PENDING_KEY = 'pastapoli.relayPending'

function asRelay(raw: Partial<RelayRun> | null | undefined): RelayRun | null {
  if (!raw) return null
  const senderId = String(raw.senderId ?? '')
  const charId = String(raw.charId ?? '')
  const themeId = String(raw.themeId ?? '')
  if (!senderId || !charId || !themeId) return null
  const relayId = String(raw.relayId ?? '') || newRelayId()
  return {
    relayId,
    senderId,
    charId,
    themeId,
    startScore: nonNegInt(String(raw.startScore ?? 0), 99_999),
    startCoins: nonNegInt(String(raw.startCoins ?? 0), 99_999),
    playedIds: normalizeIds(Array.isArray(raw.playedIds) ? raw.playedIds : []),
  }
}

/** Reads `?relay=true&...` from a page URL. Invalid links return null. */
export function parseRelay(search: string): RelayRun | null {
  const params = new URLSearchParams(search)
  if (params.get('relay') !== 'true') return null
  return asRelay({
    relayId: params.get('relayId') ?? '',
    senderId: params.get('senderId') ?? '',
    charId: params.get('char') ?? '',
    themeId: params.get('theme') ?? '',
    startScore: nonNegInt(params.get('startScore'), 99_999),
    startCoins: nonNegInt(params.get('startCoins'), 99_999),
    playedIds: normalizeIds((params.get('playedIds') ?? '').split(',')),
  })
}

export function savePendingRelay(run: RelayRun): void {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(run)) } catch {}
}

export function loadPendingRelay(): RelayRun | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    return asRelay(JSON.parse(raw) as Partial<RelayRun>)
  } catch {
    return null
  }
}

/** URL first, then the copy saved before auth. Persists a fresh link immediately. */
export function captureRelay(search: string): RelayRun | null {
  const fromUrl = parseRelay(search)
  if (fromUrl) {
    savePendingRelay(fromUrl)
    return fromUrl
  }
  return loadPendingRelay()
}

export function clearPendingRelay(): void {
  try { sessionStorage.removeItem(PENDING_KEY) } catch {}
}

export function buildRelayUrl(run: RelayRun): string {
  const url = new URL(window.location.origin + window.location.pathname)
  url.searchParams.set('relay', 'true')
  url.searchParams.set('relayId', run.relayId)
  url.searchParams.set('senderId', run.senderId)
  url.searchParams.set('char', run.charId)
  url.searchParams.set('theme', run.themeId)
  url.searchParams.set('startScore', String(run.startScore))
  url.searchParams.set('startCoins', String(run.startCoins))
  url.searchParams.set('playedIds', run.playedIds.join(','))
  return url.toString()
}

export function newRelayId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `relay-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}
