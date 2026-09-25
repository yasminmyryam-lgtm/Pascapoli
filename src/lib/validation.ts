import { z } from 'zod'

/**
 * Shared input rules.
 *
 * Username validation lives here rather than in the auth service because both
 * signup and the Settings rename need identical rules — if they drift, a name
 * accepted at signup could become unsavable later.
 *
 * These mirror the CHECK constraints in `0001_profiles.sql`. The database is
 * the real authority; this layer exists to give fast, friendly feedback.
 */

export const CREDENTIAL_RULES = {
  passwordMinLength: 8,
  usernameMinLength: 3,
  usernameMaxLength: 20,
  /** This project's configured Supabase OTP length. Display purposes only. */
  otpLength: 8,
  otpMinLength: 6,
  otpMaxLength: 10,
} as const

export const emailSchema = z.string().trim().toLowerCase().min(3).email('Enter a valid email address.')

export const passwordSchema = z
  .string()
  .min(CREDENTIAL_RULES.passwordMinLength, `Password must be at least ${CREDENTIAL_RULES.passwordMinLength} characters.`)

export const usernameSchema = z
  .string()
  .trim()
  .min(CREDENTIAL_RULES.usernameMinLength, `Username must be at least ${CREDENTIAL_RULES.usernameMinLength} characters.`)
  .max(CREDENTIAL_RULES.usernameMaxLength, `Username must be at most ${CREDENTIAL_RULES.usernameMaxLength} characters.`)
  .regex(/^[A-Za-z0-9_]+$/, 'Username can use letters, numbers and underscore only.')

/**
 * Supabase's OTP length is a project setting (6–10 digits), so the whole
 * supported range is accepted. Codes stay strings: a leading zero matters.
 */
export const otpSchema = z
  .string()
  .trim()
  .regex(
    new RegExp(`^\\d{${CREDENTIAL_RULES.otpMinLength},${CREDENTIAL_RULES.otpMaxLength}}$`),
    'Enter the code exactly as it appears in the email.',
  )
