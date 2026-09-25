/**
 * Translates Supabase / network failures into messages that are safe to show a
 * player.
 *
 * Two rules:
 *   1. Never leak whether an email is registered (account enumeration).
 *   2. Never surface a raw provider message or stack trace to the UI.
 */

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_EMAIL'
  | 'EMAIL_TAKEN'
  | 'USERNAME_TAKEN'
  | 'WEAK_PASSWORD'
  | 'INVALID_OTP'
  | 'EXPIRED_OTP'
  | 'RATE_LIMITED'
  | 'EMAIL_NOT_CONFIRMED'
  | 'NETWORK'
  | 'UNKNOWN'

export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

const MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  INVALID_EMAIL: 'That email address cannot be used. Enter a real address.',
  EMAIL_TAKEN: 'That email cannot be used. Try signing in instead.',
  USERNAME_TAKEN: 'That username is taken. Pick another.',
  WEAK_PASSWORD: 'Password must be at least 8 characters.',
  INVALID_OTP: 'That code is not valid. Check the digits and try again.',
  // Kept distinct from INVALID_OTP: an expired code means "request a new one",
  // a wrong code means "retype it" — different actions for the player.
  EXPIRED_OTP: 'That code has expired. Request a new one.',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
  EMAIL_NOT_CONFIRMED: 'Confirm your email address first, then sign in.',
  NETWORK: 'Cannot reach the server. Check your connection.',
  UNKNOWN: 'Something went wrong. Please try again.',
}

/**
 * Maps an unknown thrown value onto a controlled `AuthError`.
 *
 * Supabase does not expose stable error codes across every endpoint, so this
 * matches on the documented message fragments and falls back to UNKNOWN. The
 * original error is logged for developers but never shown to the player.
 */
/**
 * Pulls readable text out of whatever was thrown.
 *
 * Auth errors are `Error` instances, but database (PostgREST) errors are plain
 * objects shaped `{ message, code, details, hint }` — `String()` on those
 * yields "[object Object]", so the fields are read explicitly.
 */
export function describeError(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'string') return cause
  if (cause && typeof cause === 'object') {
    const { message, code, details, hint } = cause as Record<string, unknown>
    const parts = [
      typeof message === 'string' ? message : null,
      typeof code === 'string' && code ? `code ${code}` : null,
      typeof details === 'string' && details ? details : null,
      typeof hint === 'string' && hint ? `hint: ${hint}` : null,
    ].filter(Boolean)
    if (parts.length > 0) return parts.join(' — ')
    try {
      return JSON.stringify(cause)
    } catch {
      return 'Unreadable error object'
    }
  }
  return String(cause)
}

export function toAuthError(cause: unknown): AuthError {
  if (cause instanceof AuthError) return cause

  const raw = describeError(cause)
  const text = raw.toLowerCase()

  let code: AuthErrorCode = 'UNKNOWN'

  if (text.includes('failed to fetch') || text.includes('networkerror')) {
    code = 'NETWORK'
  } else if (text.includes('invalid login credentials')) {
    code = 'INVALID_CREDENTIALS'
  } else if (text.includes('is invalid') && text.includes('email')) {
    // Supabase rejects reserved and undeliverable domains (example.com, .test).
    code = 'INVALID_EMAIL'
  } else if (text.includes('already registered') || text.includes('already been registered')) {
    code = 'EMAIL_TAKEN'
  } else if (text.includes('profiles_username_key')) {
    // Only the unique index means "taken". Matching any mention of "username"
    // used to mislabel unrelated profile errors as a name collision.
    code = 'USERNAME_TAKEN'
  } else if (text.includes('password should be') || text.includes('weak password')) {
    code = 'WEAK_PASSWORD'
  } else if (text.includes('expired')) {
    code = 'EXPIRED_OTP'
  } else if (text.includes('otp') || text.includes('token has') || text.includes('invalid token')) {
    code = 'INVALID_OTP'
  } else if (text.includes('rate limit') || text.includes('too many')) {
    code = 'RATE_LIMITED'
  } else if (text.includes('email not confirmed')) {
    code = 'EMAIL_NOT_CONFIRMED'
  }

  if (code === 'UNKNOWN') {
    // Developer-facing only. Contains no password, OTP or token material.
    console.error('[auth] unmapped error:', raw)
    // In dev, show the provider's wording too — otherwise an unmapped case is
    // invisible behind the generic message. Stripped from production builds.
    if (import.meta.env.DEV) {
      return new AuthError(code, `${MESSAGES.UNKNOWN} (dev: ${raw})`)
    }
  }

  return new AuthError(code, MESSAGES[code])
}
