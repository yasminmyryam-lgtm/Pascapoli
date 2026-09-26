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

/** Reads `?relay=true&...` from a page URL. Invalid links return null. */
export function parseRelay(search: string): RelayRun | null {
  const params = new URLSearchParams(search)
  if (params.get('relay') !== 'true') return null
  const senderId = params.get('senderId') ?? ''
  const charId = params.get('char') ?? ''
  const themeId = params.get('theme') ?? ''
  const relayId = params.get('relayId') ?? ''
  if (!senderId || !charId || !themeId || !relayId) return null
  return {
    relayId,
    senderId,
    charId,
    themeId,
    startScore: nonNegInt(params.get('startScore'), 99_999),
    startCoins: nonNegInt(params.get('startCoins'), 99_999),
    playedIds: normalizeIds((params.get('playedIds') ?? '').split(',')),
  }
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
