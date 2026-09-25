/**
 * Typed access to the client-safe environment.
 *
 * Vite inlines `import.meta.env.VITE_*` at build time. Anything read here ends
 * up in the browser bundle, so only client-safe values belong in this file.
 * Server secrets (service-role key, JWT secret) are read by the game server
 * from its own process env and must never gain a `VITE_` prefix.
 *
 * Missing values must never throw at import time — that blanks the production
 * screen before React can mount. Callers use `env.isConfigured` instead.
 */

function optional(value: string | undefined, fallback = ''): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || fallback
}

/** Publishable production defaults so a Render build still boots if Vite env is empty. */
const DEFAULT_SUPABASE_URL = 'https://qnwilkzfeiuscdtvextu.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_HxVUmMWCJb--auQ6xqYCLg_LUGis_gu'

const supabaseUrl = optional(import.meta.env.VITE_SUPABASE_URL, DEFAULT_SUPABASE_URL)
const supabaseAnonKey = optional(import.meta.env.VITE_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_ANON_KEY)

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  /** True only when both publishable Supabase values were present at build time. */
  isConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  /** Used to build shareable invite links. Falls back to the current origin. */
  publicBaseUrl:
    optional(import.meta.env.VITE_PUBLIC_BASE_URL) ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8443'),
  /** Authoritative game server endpoint. Unused until Phase 3. */
  gameServerUrl: optional(import.meta.env.VITE_GAME_SERVER_URL, 'ws://localhost:2567'),
  /** HTTP economy API. Empty means same-origin (Node serving the frontend). */
  economyApiUrl: optional(import.meta.env.VITE_ECONOMY_API_URL),
} as const

if (!env.isConfigured) {
  console.warn(
    '[env] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Sign-in is disabled until they are set for the production build.',
  )
}
