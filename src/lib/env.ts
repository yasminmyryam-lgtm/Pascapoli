/**
 * Typed access to the client-safe environment.
 *
 * Vite inlines `import.meta.env.VITE_*` at build time. Anything read here ends
 * up in the browser bundle, so only client-safe values belong in this file.
 * Server secrets (service-role key, JWT secret) are read by the game server
 * from its own process env and must never gain a `VITE_` prefix.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in, then restart the dev server.`,
    )
  }
  return value
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  /** Used to build shareable invite links. Falls back to the current origin. */
  publicBaseUrl:
    import.meta.env.VITE_PUBLIC_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8443'),
  /** Authoritative game server endpoint. Unused until Phase 3. */
  gameServerUrl: import.meta.env.VITE_GAME_SERVER_URL ?? 'ws://localhost:2567',
  /** HTTP economy API. Empty means same-origin (Node serving the frontend). */
  economyApiUrl: import.meta.env.VITE_ECONOMY_API_URL ?? '',
} as const
