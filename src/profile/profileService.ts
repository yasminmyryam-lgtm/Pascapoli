import { supabase } from '../lib/supabase'
import { usernameSchema } from '../lib/validation'
import { AuthError, toAuthError } from '../auth/errors'

/**
 * Reads and writes the player's `profiles` row.
 *
 * RLS restricts every query here to the caller's own row, so no user id is
 * trusted from the client for authorisation — it is only used to address the
 * row. Progression columns arrive in Phase 2 and will be server-written.
 */

export type Profile = {
  id: string
  username: string
}

type ProfileRow = {
  id: string
  username: string
}

/** Distinguishes "table missing" from ordinary failures so setup errors are obvious. */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  // PGRST205: PostgREST cannot find the table in its schema cache.
  return error.code === 'PGRST205' || (error.message ?? '').includes('does not exist')
}

/** 42501: the role lacks table privileges — a setup problem, not a player error. */
function isPermissionDenied(error: { code?: string }): boolean {
  return error.code === '42501'
}

const PERMISSION_HINT =
  'Database permissions are missing. Run supabase/migrations/0002_profiles_grants.sql in the SQL Editor.'

function fallbackProfile(userId: string, username?: string | null): Profile {
  const raw = (username ?? '').replace(/[^A-Za-z0-9_]/g, '')
  const safe = raw.length >= 3 ? raw.slice(0, 20) : `player_${userId.slice(0, 6)}`
  return { id: userId, username: safe }
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('id', userId)
    .maybeSingle<ProfileRow>()

  if (error) {
    // Missing tables or grants must never block sign-in.
    if (isMissingTable(error) || isPermissionDenied(error)) {
      console.warn('[profile] profiles table unavailable; using local fallback.', error.message ?? PERMISSION_HINT)
      const { data: auth } = await supabase.auth.getUser()
      const metaName = (auth.user?.user_metadata as { username?: unknown } | undefined)?.username
      return fallbackProfile(userId, typeof metaName === 'string' ? metaName : auth.user?.email?.split('@')[0])
    }
    throw toAuthError(error)
  }

  if (data) return { id: data.id, username: data.username }

  const { data: auth } = await supabase.auth.getUser()
  const metaName = (auth.user?.user_metadata as { username?: unknown } | undefined)?.username
  const created = fallbackProfile(userId, typeof metaName === 'string' ? metaName : auth.user?.email?.split('@')[0])
  const { error: insertError } = await supabase.from('profiles').insert({ id: userId, username: created.username })
  if (insertError && !isMissingTable(insertError) && !isPermissionDenied(insertError) && insertError.code !== '23505') {
    console.warn('[profile] could not create profile row:', insertError.message)
  }
  return created
}

/**
 * Renames the player.
 *
 * The unique index on `username` is what actually prevents duplicates — two
 * simultaneous renames to the same name cannot both win, regardless of any
 * availability check we might do beforehand. So rather than pre-checking, we
 * attempt the write and translate the constraint violation.
 */
export async function updateUsername(userId: string, nextUsername: string): Promise<Profile> {
  const parsed = usernameSchema.safeParse(nextUsername)
  if (!parsed.success) {
    throw new AuthError('UNKNOWN', parsed.error.issues[0]?.message ?? 'That username is not valid.')
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ username: parsed.data })
    .eq('id', userId)
    .select('id, username')
    .maybeSingle<ProfileRow>()

  if (error) {
    // 23505 is Postgres' unique_violation.
    if (error.code === '23505') {
      throw new AuthError('USERNAME_TAKEN', 'That username is taken. Pick another.')
    }
    if (isMissingTable(error) || isPermissionDenied(error)) {
      console.warn('[profile] cannot rename — profiles table unavailable.')
      return { id: userId, username: parsed.data }
    }
    // 23514: a CHECK constraint rejected the value (length or charset).
    if (error.code === '23514') {
      throw new AuthError('UNKNOWN', 'Username can use 3–20 letters, numbers and underscore only.')
    }
    throw toAuthError(error)
  }

  if (!data) {
    // An empty result means RLS matched no row — the profile is missing.
    throw new AuthError('UNKNOWN', 'Your profile row is missing. Check that the signup trigger is installed.')
  }

  return { id: data.id, username: data.username }
}
