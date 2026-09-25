import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import type { z } from 'zod'
import { supabase } from '../lib/supabase'
import { env } from '../lib/env'
import { CREDENTIAL_RULES, emailSchema, otpSchema, passwordSchema, usernameSchema } from '../lib/validation'
import { AuthError, toAuthError } from './errors'
import { beginPasswordRecovery, endPasswordRecovery } from './recoveryState'

export { CREDENTIAL_RULES }

function requireConfigured() {
  if (!env.isConfigured) {
    throw new AuthError(
      'UNKNOWN',
      'Sign-in is not configured on this deploy. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.',
    )
  }
}

/**
 * AUTHENTICATION SERVICE
 * ======================
 * Every auth call the app makes goes through this module. It owns validation
 * and error translation and knows nothing about React — the UI imports
 * functions, never the Supabase client.
 *
 * Password recovery uses Supabase's own 6-digit email OTP. We never generate,
 * store, hash or compare a code ourselves: expiry, single-use and attempt
 * limits are enforced by the provider. That is both less code and a smaller
 * attack surface than a hand-rolled OTP table.
 *
 * Supabase dashboard prerequisite: the "Reset Password" email template must
 * emit {{ .Token }} (the 6-digit code) rather than {{ .ConfirmationURL }}.
 */

/**
 * Runs a schema and rethrows as an `AuthError` so callers only ever handle one
 * error type.
 */
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new AuthError('UNKNOWN', first?.message ?? 'That value is not valid.')
  }
  return result.data
}

/* --- Types --------------------------------------------------------------- */

export type RegisterInput = { email: string; username: string; password: string }
export type LoginInput = { email: string; password: string }

export type RegisterResult =
  /** A session exists — email confirmation is disabled, play immediately. */
  | { status: 'SIGNED_IN'; session: Session; user: User }
  /** Account created but Supabase requires email confirmation before login. */
  | { status: 'CONFIRMATION_REQUIRED' }

/* --- Registration -------------------------------------------------------- */

export async function register(input: RegisterInput): Promise<RegisterResult> {
  requireConfigured()
  const email = parse(emailSchema, input.email)
  const username = parse(usernameSchema, input.username)
  const password = parse(passwordSchema, input.password)

  try {
    // `username` travels as user metadata; the 0001_profiles trigger reads it
    // and creates the profile row in the same transaction as the auth user.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    })
    if (error) throw error

    // Auto-confirm / disabled email confirmation returns a session immediately.
    if (data.session && data.user) {
      return { status: 'SIGNED_IN', session: data.session, user: data.user }
    }

    // Some projects attach the session a tick later — pick it up if present.
    const { data: existing } = await supabase.auth.getSession()
    if (existing.session?.user) {
      return { status: 'SIGNED_IN', session: existing.session, user: existing.session.user }
    }

    // Empty identities usually means the email is already registered.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      throw new AuthError('EMAIL_TAKEN', 'That email cannot be used. Try signing in instead.')
    }

    return { status: 'CONFIRMATION_REQUIRED' }
  } catch (cause) {
    throw toAuthError(cause)
  }
}

/* --- Login / logout ------------------------------------------------------ */

export async function login(input: LoginInput): Promise<Session> {
  requireConfigured()
  const email = parse(emailSchema, input.email)
  // Not length-validated: an existing short password must still be able to
  // sign in, and the provider is the authority on whether it matches.
  const password = input.password

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.session) throw new AuthError('UNKNOWN', 'Sign-in did not return a session.')
    return data.session
  } catch (cause) {
    throw toAuthError(cause)
  }
}

export async function logout(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  } catch (cause) {
    throw toAuthError(cause)
  } finally {
    // Clear the flag even if sign-out failed, so abandoning a reset can never
    // strand the UI on the new-password screen.
    endPasswordRecovery()
  }
}

/**
 * Re-sends the signup confirmation email.
 *
 * Needed because email confirmation is enabled: without this, a player whose
 * confirmation email is lost or expired has no route back into their account.
 *
 * Like `requestPasswordReset`, this stays silent about whether the address
 * exists or is already confirmed, so it cannot be used to probe for accounts.
 */
export async function resendConfirmationEmail(emailInput: string): Promise<void> {
  const email = parse(emailSchema, emailInput)

  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) {
      const mapped = toAuthError(error)
      if (mapped.code === 'RATE_LIMITED' || mapped.code === 'NETWORK') throw mapped
      console.error('[auth] resend suppressed:', mapped.code)
    }
  } catch (cause) {
    const mapped = toAuthError(cause)
    if (mapped.code === 'RATE_LIMITED' || mapped.code === 'NETWORK') throw mapped
    console.error('[auth] resend suppressed:', mapped.code)
  }
}

/* --- Session ------------------------------------------------------------- */

export async function getSession(): Promise<Session | null> {
  if (!env.isConfigured) return null
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  } catch (cause) {
    throw toAuthError(cause)
  }
}

/** Subscribes to sign-in / sign-out / token-refresh / recovery. Returns an unsubscribe. */
export function onAuthStateChange(
  handler: (session: Session | null, event: AuthChangeEvent) => void,
): () => void {
  if (!env.isConfigured) return () => {}
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') beginPasswordRecovery()
    if (event === 'SIGNED_OUT') endPasswordRecovery()
    handler(session, event)
  })
  return () => data.subscription.unsubscribe()
}

/* --- Password recovery (real 6-digit OTP) -------------------------------- */

/**
 * Step 1 — request a recovery code.
 *
 * Resolves the same way whether or not the address is registered. Supabase
 * itself does not disclose existence here, and neither does this function: no
 * boolean, no distinct error, no different latency path. That is what stops
 * this endpoint from becoming an account-existence oracle.
 */
function providerErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const rec = error as { error_description?: unknown; message?: unknown }
    if (typeof rec.error_description === 'string' && rec.error_description.trim()) return rec.error_description
    if (typeof rec.message === 'string' && rec.message.trim()) return rec.message
  }
  if (typeof error === 'string' && error.trim()) return error
  return 'Error sending recovery email'
}

export async function requestPasswordReset(emailInput: string): Promise<void> {
  requireConfigured()
  const email = parse(emailSchema, emailInput)

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) {
      console.error('[auth] resetPasswordForEmail failed:', error)
      throw new AuthError('UNKNOWN', providerErrorMessage(error))
    }
  } catch (cause) {
    console.error('[auth] resetPasswordForEmail failed:', cause)
    if (cause instanceof AuthError) throw cause
    throw new AuthError('UNKNOWN', providerErrorMessage(cause))
  }
}

/**
 * Verify the emailed OTP and set the new password in one step.
 * The recovery flag stays on until the password write succeeds so App
 * does not drop the player into the game with the old password still set.
 */
export async function completePasswordReset(
  emailInput: string,
  codeInput: string,
  newPassword: string,
): Promise<void> {
  requireConfigured()
  const email = parse(emailSchema, emailInput)
  const token = parse(otpSchema, codeInput)
  const password = parse(passwordSchema, newPassword)

  try {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' })
    if (error) throw error
    if (!data.session) throw new AuthError('INVALID_OTP', 'That code is not valid. Check the digits and try again.')

    beginPasswordRecovery()

    const { error: passwordError } = await supabase.auth.updateUser({ password })
    if (passwordError) throw passwordError
    endPasswordRecovery()
  } catch (cause) {
    throw toAuthError(cause)
  }
}

/**
 * Step 2 — exchange the emailed code for a recovery session.
 *
 * This returns a fully valid session, which is why `beginPasswordRecovery` is
 * flagged before returning: without it the app would treat the player as
 * signed in and skip the new-password step entirely.
 *
 * A wrong or expired code yields no session, so step 3 stays unreachable.
 */
export async function verifyPasswordResetCode(emailInput: string, codeInput: string): Promise<Session> {
  const email = parse(emailSchema, emailInput)
  const token = parse(otpSchema, codeInput)

  try {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' })
    if (error) throw error
    if (!data.session) throw new AuthError('INVALID_OTP', 'That code is not valid.')

    // Order matters: flag recovery before the caller reacts to the new session.
    beginPasswordRecovery()
    return data.session
  } catch (cause) {
    throw toAuthError(cause)
  }
}

/**
 * Step 3 — set the new password using the recovery session from step 2.
 *
 * The session is kept afterwards, so clearing the recovery flag drops the
 * player straight into the game. Supabase revokes the other outstanding
 * sessions on a password change, so a stolen recovery code cannot leave a
 * usable session behind elsewhere.
 */
export async function updatePassword(newPassword: string): Promise<void> {
  const password = parse(passwordSchema, newPassword)

  try {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    endPasswordRecovery()
  } catch (cause) {
    throw toAuthError(cause)
  }
}
