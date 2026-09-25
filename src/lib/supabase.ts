import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

/**
 * The single browser Supabase client.
 *
 * Created once at module scope — more than one instance racing on the same
 * storage key causes the session to be dropped on refresh.
 *
 * This client carries the anon key, which is publishable by design: every
 * request it makes is still constrained by Row Level Security. It is never a
 * substitute for trusted server logic, so competitive writes (coins, XP, match
 * results) go through the game server's service-role client instead.
 *
 * URL and anon key come from `env`, which already falls back to the
 * production publishable defaults when Vite did not inline them.
 */
const url = env.supabaseUrl || 'https://qnwilkzfeiuscdtvextu.supabase.co'
const key = env.supabaseAnonKey || 'sb_publishable_HxVUmMWCJb--auQ6xqYCLg_LUGis_gu'

export const supabase: SupabaseClient = createClient(url, key, {
  auth: {
    persistSession: env.isConfigured,
    autoRefreshToken: env.isConfigured,
    detectSessionInUrl: false,
    storageKey: 'pastapoli.auth.session',
  },
})
