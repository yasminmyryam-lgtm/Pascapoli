import React, { useState } from 'react'
import { CREDENTIAL_RULES } from './lib/validation'
import {
  login,
  register,
  requestPasswordReset,
  resendConfirmationEmail,
  updatePassword,
  verifyPasswordResetCode,
} from './auth/authService'
import { toAuthError, type AuthErrorCode } from './auth/errors'

/**
 * Authentication screen. Visual language is unchanged from the original local
 * version; only the logic behind it moved to Supabase.
 *
 * Recovery is a real four-step flow — request code, verify code, set password,
 * sign in — backed by Supabase's 6-digit email OTP. No code is ever generated
 * or displayed in the browser.
 */

type Mode = 'login' | 'register' | 'forgot' | 'otp' | 'reset'

const TITLES: Record<Mode, string> = {
  login: 'Sign In',
  register: 'Create Account',
  forgot: 'Account Recovery',
  otp: 'Enter Code',
  reset: 'Set New Password',
}

const INPUT_CLASS = 'w-full rounded-2xl bg-black/25 px-5 py-4 text-white outline-none'

export default function Auth() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [info, setInfo] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const goTo = (next: Mode) => {
    setMode(next)
    setErrorMsg('')
    setErrorCode(null)
    setInfo('')
  }

  /** Every submit handler shares this shape: clear, run, map errors, stop loading. */
  const run = async (action: () => Promise<void>) => {
    setErrorMsg('')
    setErrorCode(null)
    setInfo('')
    setIsLoading(true)
    try {
      await action()
    } catch (cause) {
      const mapped = toAuthError(cause)
      setErrorMsg(mapped.message)
      setErrorCode(mapped.code)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendConfirmation = () => {
    void run(async () => {
      await resendConfirmationEmail(email)
      setInfo('If that account needs confirming, a new email is on its way.')
    })
  }

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (mode === 'register') {
        const result = await register({ email, username, password })
        if (result.status === 'CONFIRMATION_REQUIRED') {
          setInfo('Account created. Check your email to confirm it, then sign in.')
          setMode('login')
          setPassword('')
        }
        // On SIGNED_IN the session listener in App swaps this screen out.
        return
      }
      await login({ email, password })
    })
  }

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await requestPasswordReset(email)
      // Deliberately identical whether or not the account exists.
      setMode('otp')
      setInfo('If an account exists for this email, a recovery code has been sent.')
    })
  }

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await verifyPasswordResetCode(email, code)
      setMode('reset')
      setInfo('Code accepted. Choose a new password.')
    })
  }

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.')
        setErrorCode('UNKNOWN')
        return
      }
      // Clears the recovery flag on success, which lets `App` render the game
      // using the session already established by the verified code.
      await updatePassword(password)
      setPassword('')
      setConfirmPassword('')
      setCode('')
    })
  }

  const feedback = (
    <>
      {errorMsg && <p className="text-xs font-bold text-[#ff4d4d] text-center">{errorMsg}</p>}
      {info && <p className="text-xs font-bold text-[#6ee7a8] text-center">{info}</p>}
    </>
  )

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 md:p-8 bg-[#1a0d2e]">
      <div className="w-full max-w-md rounded-[40px] border border-white/10 bg-[#2b1c47] p-8 shadow-2xl">
        <h2 className="text-3xl font-black text-white text-center mb-6">{TITLES[mode]}</h2>

        {(mode === 'login' || mode === 'register') && (
          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className={INPUT_CLASS}
              required
            />
            {mode === 'register' && (
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                autoComplete="username"
                minLength={CREDENTIAL_RULES.usernameMinLength}
                maxLength={CREDENTIAL_RULES.usernameMaxLength}
                className={INPUT_CLASS}
                required
              />
            )}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              className={INPUT_CLASS}
              required
            />
            {feedback}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-2xl py-4 text-lg font-black uppercase text-[#123] bg-[#6ee7a8] disabled:opacity-50"
            >
              {isLoading ? 'Please wait...' : 'Play Now'}
            </button>
            {errorCode === 'EMAIL_NOT_CONFIRMED' && (
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={isLoading}
                className="text-sm font-bold text-[#8ec5ff] disabled:opacity-50"
              >
                Resend confirmation email
              </button>
            )}
            {mode === 'login' && (
              <button type="button" onClick={() => goTo('forgot')} className="text-sm font-bold text-[#8ec5ff]">
                Forgot your password?
              </button>
            )}
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="flex flex-col gap-4">
            <p className="text-white/60 text-sm text-center">Enter your account email and we'll send you a recovery code.</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className={INPUT_CLASS}
              required
            />
            {feedback}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-2xl py-4 text-lg font-black uppercase text-[#123] bg-[#8ec5ff] disabled:opacity-50"
            >
              {isLoading ? 'Sending...' : 'Send Code'}
            </button>
          </form>
        )}

        {mode === 'otp' && (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
            <p className="text-white/60 text-sm text-center">
              Enter the {CREDENTIAL_RULES.otpLength}-digit code sent to <span className="text-white">{email}</span>.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CREDENTIAL_RULES.otpMaxLength))}
              placeholder={'0'.repeat(CREDENTIAL_RULES.otpLength)}
              // Looser tracking than a 6-digit field so a 10-digit code still fits.
              className={`${INPUT_CLASS} text-center text-2xl tracking-[0.25em]`}
              required
            />
            {feedback}
            <button
              type="submit"
              disabled={isLoading || code.length < CREDENTIAL_RULES.otpMinLength}
              className="mt-2 w-full rounded-2xl py-4 text-lg font-black uppercase text-[#123] bg-[#6ee7a8] disabled:opacity-50"
            >
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </button>
            <button type="button" onClick={() => goTo('forgot')} className="text-sm font-bold text-[#8ec5ff]">
              Send a new code
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <p className="text-white/60 text-sm text-center">
              Code verified. Choose a new password to finish and start playing.
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New Password"
              autoComplete="new-password"
              minLength={CREDENTIAL_RULES.passwordMinLength}
              className={INPUT_CLASS}
              required
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm Password"
              autoComplete="new-password"
              minLength={CREDENTIAL_RULES.passwordMinLength}
              className={INPUT_CLASS}
              required
            />
            {feedback}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-2xl py-4 text-lg font-black uppercase text-[#123] bg-[#6ee7a8] disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </form>
        )}

        {/* Hidden during 'reset': a recovery session is already active, so
            leaving here would strand the player signed in with the old
            password still unchanged. */}
        {mode !== 'reset' && (
          <button
            onClick={() => goTo(mode === 'register' ? 'login' : mode === 'login' ? 'register' : 'login')}
            className="mt-6 w-full text-sm font-bold text-white/40"
          >
            {mode === 'register'
              ? 'Already have an account? Tap here.'
              : mode === 'login'
                ? "Don't have an account? Create one."
                : 'Back to sign in.'}
          </button>
        )}
      </div>
    </div>
  )
}
