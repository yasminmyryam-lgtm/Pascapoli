import React, { useEffect, useState } from 'react'
import { CREDENTIAL_RULES } from './lib/validation'
import {
  completePasswordReset,
  login,
  register,
  requestPasswordReset,
  resendConfirmationEmail,
  updatePassword,
} from './auth/authService'
import { describeError, toAuthError, type AuthErrorCode } from './auth/errors'
import { env } from './lib/env'
import { useIsRecoveringPassword } from './auth/recoveryState'
import { enableGuestPlay } from './auth/guestPlay'

type Mode = 'login' | 'register' | 'forgot' | 'otp' | 'reset'

const TITLES: Record<Mode, string> = {
  login: 'Sign In',
  register: 'Create Account',
  forgot: 'Forgot password?',
  otp: 'Enter Code',
  reset: 'Set New Password',
}

const INPUT_CLASS = 'w-full rounded-2xl bg-black/25 px-5 py-4 text-white outline-none'

export default function Auth() {
  const recovering = useIsRecoveringPassword()
  const [mode, setMode] = useState<Mode>(recovering ? 'reset' : 'login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [info, setInfo] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (recovering) setMode((current) => (current === 'otp' ? current : 'reset'))
  }, [recovering])

  const goTo = (next: Mode) => {
    setMode(next)
    setErrorMsg('')
    setErrorCode(null)
    setInfo('')
  }

  const run = async (action: () => Promise<void>) => {
    setErrorMsg('')
    setErrorCode(null)
    setInfo('')
    setIsLoading(true)
    try {
      await action()
    } catch (cause) {
      const mapped = toAuthError(cause)
      setErrorMsg(mapped.message || describeError(cause))
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
        return
      }
      await login({ email, password })
    })
  }

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setErrorCode(null)
    setInfo('')
    setIsLoading(true)
    void (async () => {
      try {
        await requestPasswordReset(email.trim())
        setMode('otp')
        setCode('')
        setPassword('')
        setConfirmPassword('')
        setInfo('Enter the code we sent to your email.')
      } catch (cause) {
        console.error('[auth] resetPasswordForEmail failed:', cause)
        const rec = cause && typeof cause === 'object' ? (cause as { error_description?: unknown; message?: unknown }) : null
        const message =
          (typeof rec?.error_description === 'string' && rec.error_description) ||
          (typeof rec?.message === 'string' && rec.message) ||
          describeError(cause)
        setErrorMsg(message)
        setErrorCode('UNKNOWN')
      } finally {
        setIsLoading(false)
      }
    })()
  }

  const handleOtpReset = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.')
        setErrorCode('UNKNOWN')
        return
      }
      await completePasswordReset(email, code, password)
      setCode('')
      setPassword('')
      setConfirmPassword('')
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
      await updatePassword(password)
      setPassword('')
      setConfirmPassword('')
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
        {!env.isConfigured && (
          <p className="mb-4 text-center text-xs font-bold text-[#ffd24d]">
            Sign-in is unavailable on this deploy. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.
          </p>
        )}

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
            <p className="text-white/60 text-sm text-center">
              Enter your account email and we will send a 6–8 digit code.
            </p>
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
              {isLoading ? 'Sending...' : 'Send code'}
            </button>
          </form>
        )}

        {mode === 'otp' && (
          <form onSubmit={handleOtpReset} className="flex flex-col gap-4">
            <p className="text-white/60 text-sm text-center">
              Enter the code sent to <span className="text-white">{email}</span>, then choose a new password.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CREDENTIAL_RULES.otpMaxLength))}
              placeholder={'0'.repeat(CREDENTIAL_RULES.otpLength)}
              className={`${INPUT_CLASS} text-center text-2xl tracking-[0.25em]`}
              required
            />
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
              disabled={isLoading || code.length < CREDENTIAL_RULES.otpMinLength}
              className="mt-2 w-full rounded-2xl py-4 text-lg font-black uppercase text-[#123] bg-[#6ee7a8] disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Verify and save'}
            </button>
            <button type="button" onClick={() => goTo('forgot')} className="text-sm font-bold text-[#8ec5ff]">
              Send a new code
            </button>
            <button type="button" onClick={() => goTo('login')} className="text-sm font-bold text-white/40">
              Back to sign in.
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <p className="text-white/60 text-sm text-center">
              Choose a new password. You will stay signed in after it is saved.
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
              {isLoading ? 'Saving...' : 'Save and play'}
            </button>
          </form>
        )}

        {mode !== 'reset' && mode !== 'otp' && (
          <>
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
            <button
              type="button"
              onClick={() => enableGuestPlay()}
              className="mt-3 w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-black uppercase text-white/80"
            >
              Play as Guest
            </button>
          </>
        )}
      </div>
    </div>
  )
}
