import { supabase } from '../lib/supabase'
import { env } from '../lib/env'
import { diamondReviveCost, isAdRevive } from '../../shared/economy'
import { setState } from '../store'

export { diamondReviveCost, isAdRevive }

type ReviveResult =
  | { ok: true; diamonds: number }
  | { ok: false; reason: 'poor' | 'offline' | 'auth' | 'invalid'; message: string }

type DoubleResult<T> =
  | { ok: true; payout: T }
  | { ok: false; message: string }

function economyBaseUrl(): string {
  const explicit = import.meta.env.VITE_ECONOMY_API_URL as string | undefined
  if (explicit) return explicit.replace(/\/$/, '')
  return ''
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!env.isConfigured) return {}
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

async function postJson<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  const base = economyBaseUrl()
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  })
  let data: T | null = null
  try {
    data = (await res.json()) as T
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data }
}

/**
 * Seeds the server wallet once from the local save, then keeps local diamonds
 * in sync with the authoritative balance whenever the server answers.
 */
export async function syncWallet(localDiamonds: number): Promise<number | null> {
  try {
    const { ok, data } = await postJson<{ diamonds: number }>('/api/economy/wallet/seed', {
      diamonds: Math.max(0, Math.floor(localDiamonds)),
    })
    if (!ok || !data || typeof data.diamonds !== 'number') return null
    setState({ diamonds: data.diamonds })
    return data.diamonds
  } catch {
    return null
  }
}

/**
 * Revives 4+ charge diamonds. The server computes the price and deducts.
 * Local deduct is only used when the economy API is unreachable (dev).
 */
export async function chargeReviveDiamonds(reviveNumber: number, currentDiamonds: number): Promise<ReviveResult> {
  const cost = diamondReviveCost(reviveNumber)
  if (cost <= 0) return { ok: true, diamonds: currentDiamonds }
  if (currentDiamonds < cost) {
    return { ok: false, reason: 'poor', message: `Need ${cost} diamonds to revive.` }
  }

  try {
    const { ok, status, data } = await postJson<{ diamonds: number; error?: string }>('/api/economy/revive', {
      reviveNumber,
    })
    if (ok && data && typeof data.diamonds === 'number') {
      setState({ diamonds: data.diamonds })
      return { ok: true, diamonds: data.diamonds }
    }
    if (status === 402) {
      return { ok: false, reason: 'poor', message: data?.error ?? `Need ${cost} diamonds to revive.` }
    }
    if (status === 401) {
      return { ok: false, reason: 'auth', message: 'Sign in to spend diamonds on a revive.' }
    }
    if (status === 404 || status === 503) throw new Error('economy unavailable')
  } catch {
    setState((s) => ({ diamonds: Math.max(0, s.diamonds - cost) }))
    return { ok: true, diamonds: currentDiamonds - cost }
  }

  return { ok: false, reason: 'offline', message: 'Could not charge diamonds. Try again.' }
}

export async function authorizeDouble<T extends { coins: number; diamonds: number }>(
  kind: 'wheel' | 'chest',
  payout: T,
  doubled: boolean,
): Promise<DoubleResult<T>> {
  const scaled = {
    ...payout,
    coins: payout.coins * (doubled ? 2 : 1),
    diamonds: payout.diamonds * (doubled ? 2 : 1),
  }
  try {
    const { ok, data } = await postJson<{ payout: T }>('/api/economy/payouts/claim', {
      kind,
      payout,
      doubled,
    })
    if (ok && data?.payout) {
      if (typeof data.payout.diamonds === 'number' && data.payout.diamonds > 0) {
        setState((s) => ({ diamonds: s.diamonds + data.payout.diamonds }))
      }
      return { ok: true, payout: { ...payout, ...data.payout } }
    }
  } catch {
    // fall through to the client-authorized scaled payout
  }
  if (scaled.diamonds > 0) setState((s) => ({ diamonds: s.diamonds + scaled.diamonds }))
  return { ok: true, payout: scaled }
}
