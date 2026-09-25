import { createClient } from '@supabase/supabase-js'
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
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    // Keep the player signed in across refreshes and refresh tokens silently.
    persistSession: true,
    autoRefreshToken: true,
    // The app has no OAuth redirect flow, so URL parsing is unnecessary.
    detectSessionInUrl: false,
    storageKey: 'pastapoli.auth.session',
  },
})
