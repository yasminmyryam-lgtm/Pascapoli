import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { diamondReviveCost, isAdRevive, scalePayout } from '../shared/economy.ts'

const PORT = process.env.PORT || 8443
const HOST = '0.0.0.0'
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:8443')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const DIR = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(DIR, '../dist')

type WalletRow = { diamonds: number; wallet_seeded: boolean }

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin
  if (origin && (ALLOWED.includes(origin) || ALLOWED.includes('*'))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function userFromRequest(req: IncomingMessage): Promise<{ id: string } | null> {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const db = supabaseAdmin()
  if (!db) return null
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id }
}

async function readWallet(db: SupabaseClient, userId: string): Promise<WalletRow> {
  const { data, error } = await db
    .from('profiles')
    .select('diamonds, wallet_seeded')
    .eq('id', userId)
    .maybeSingle<WalletRow>()
  if (error || !data) return { diamonds: 0, wallet_seeded: false }
  return {
    diamonds: Math.max(0, Math.floor(Number(data.diamonds) || 0)),
    wallet_seeded: Boolean(data.wallet_seeded),
  }
}

async function writeWallet(db: SupabaseClient, userId: string, diamonds: number, seeded = true) {
  await db
    .from('profiles')
    .update({ diamonds, wallet_seeded: seeded })
    .eq('id', userId)
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' })
    return
  }

  const user = await userFromRequest(req)
  const db = supabaseAdmin()
  let body: Record<string, unknown> = {}
  try {
    const raw = await readBody(req)
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    json(res, 400, { error: 'Invalid JSON' })
    return
  }

  if (url.pathname === '/api/economy/wallet/seed') {
    if (!user || !db) {
      json(res, 503, { error: 'Economy server is not configured' })
      return
    }
    const wallet = await readWallet(db, user.id)
    if (wallet.wallet_seeded) {
      json(res, 200, { diamonds: wallet.diamonds })
      return
    }
    const seed = Math.max(0, Math.min(100_000, Math.floor(Number(body.diamonds) || 0)))
    await writeWallet(db, user.id, seed, true)
    json(res, 200, { diamonds: seed })
    return
  }

  if (url.pathname === '/api/economy/revive') {
    if (!user || !db) {
      json(res, 503, { error: 'Economy server is not configured' })
      return
    }
    const reviveNumber = Math.floor(Number(body.reviveNumber))
    if (!Number.isFinite(reviveNumber) || reviveNumber < 4) {
      json(res, 400, { error: 'Diamond revive starts at revive 4.' })
      return
    }
    if (isAdRevive(reviveNumber)) {
      json(res, 400, { error: 'This revive is ad-gated.' })
      return
    }
    const cost = diamondReviveCost(reviveNumber)
    const wallet = await readWallet(db, user.id)
    if (wallet.diamonds < cost) {
      json(res, 402, { error: `Need ${cost} diamonds to revive.`, diamonds: wallet.diamonds })
      return
    }
    const next = wallet.diamonds - cost
    await writeWallet(db, user.id, next, true)
    json(res, 200, { ok: true, diamonds: next, cost })
    return
  }

  if (url.pathname === '/api/economy/payouts/claim') {
    const kind = body.kind === 'chest' ? 'chest' : body.kind === 'wheel' ? 'wheel' : null
    if (!kind) {
      json(res, 400, { error: 'Unknown payout kind' })
      return
    }
    const payout = (body.payout ?? {}) as { coins?: number; diamonds?: number }
    const coins = Math.max(0, Math.min(1_000_000, Math.floor(Number(payout.coins) || 0)))
    const diamonds = Math.max(0, Math.min(10_000, Math.floor(Number(payout.diamonds) || 0)))
    const doubled = body.doubled === true
    const scaled = scalePayout({ coins, diamonds }, doubled)

    if (user && db && scaled.diamonds > 0) {
      const wallet = await readWallet(db, user.id)
      await writeWallet(db, user.id, wallet.diamonds + scaled.diamonds, true)
    }

    json(res, 200, { ok: true, kind, payout: scaled })
    return
  }

  json(res, 404, { error: 'Not found' })
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

async function serveStatic(res: ServerResponse, url: URL) {
  if (!existsSync(DIST)) {
    json(res, 404, { error: 'Frontend build not found. Run npm run build.' })
    return
  }
  const clean = path.normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '')
  let file = path.join(DIST, clean)
  if (!file.startsWith(DIST)) {
    json(res, 403, { error: 'Forbidden' })
    return
  }
  if (!existsSync(file) || clean === '') file = path.join(DIST, 'index.html')
  try {
    const data = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    const fallback = await readFile(path.join(DIST, 'index.html'))
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(fallback)
  }
}

const app = createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  try {
    if (url.pathname === '/health' || url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url)
      return
    }
    await serveStatic(res, url)
  } catch (err) {
    console.error('[server]', err)
    json(res, 500, { error: 'Internal error' })
  }
})

app.listen(PORT, HOST, () => {
  console.log(`Pastapoli server listening on ${HOST}:${PORT}`)
})
