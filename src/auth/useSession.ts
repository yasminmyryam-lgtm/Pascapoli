import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isFounderEmail } from '../founder'
import { getSession, onAuthStateChange } from './authService'

export type SessionStatus = 'LOADING' | 'AUTHENTICATED' | 'ANONYMOUS'

export type SessionState = {
  status: SessionStatus
  session: Session | null
  userId: string | null
  email: string | null
  /** Username from signup metadata. The profile row is the source of truth in Phase 2. */
  username: string | null
  isFounder: boolean
}

const ANONYMOUS: SessionState = {
  status: 'ANONYMOUS',
  session: null,
  userId: null,
  email: null,
  username: null,
  isFounder: false,
}

function fromSession(session: Session | null): SessionState {
  if (!session) return ANONYMOUS
  const meta = session.user.user_metadata as { username?: unknown }
  return {
    status: 'AUTHENTICATED',
    session,
    userId: session.user.id,
    email: session.user.email ?? null,
    username: typeof meta?.username === 'string' ? meta.username : null,
    isFounder: isFounderEmail(session.user.email),
  }
}

/**
 * Restores the persisted Supabase session on mount and then tracks sign-in,
 * sign-out and silent token refresh.
 *
 * `LOADING` exists so the app can avoid flashing the sign-in screen at a player
 * who is already authenticated — restoring the session is asynchronous.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ ...ANONYMOUS, status: 'LOADING' })

  useEffect(() => {
    let cancelled = false

    getSession()
      .then((session) => {
        if (!cancelled) setState(fromSession(session))
      })
      .catch((cause: unknown) => {
        // A failed restore is not fatal: treat the player as signed out and let
        // them retry through the form, which surfaces a real error message.
        console.error('[auth] session restore failed:', cause)
        if (!cancelled) setState(ANONYMOUS)
      })

    const unsubscribe = onAuthStateChange((session) => {
      if (!cancelled) setState(fromSession(session))
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return state
}
