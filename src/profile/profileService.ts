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

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('id', userId)
    .maybeSingle<ProfileRow>()

  if (error) {
    if (isMissingTable(error)) {
      throw new AuthError(
        'UNKNOWN',
        'Profiles table not found. Run supabase/migrations/0001_profiles.sql in the SQL Editor.',
      )
    }
    if (isPermissionDenied(error)) throw new AuthError('UNKNOWN', PERMISSION_HINT)
    throw toAuthError(error)
  }

  return data ? { id: data.id, username: data.username } : null
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
    if (isMissingTable(error)) {
      throw new AuthError(
        'UNKNOWN',
        'Profiles table not found. Run supabase/migrations/0001_profiles.sql in the SQL Editor.',
      )
    }
    if (isPermissionDenied(error)) throw new AuthError('UNKNOWN', PERMISSION_HINT)
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
