import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isFounderEmail } from '../founder'
import { getSession, onAuthStateChange } from './authService'
import {
  beginPasswordRecovery,
  clearRecoveryParamsFromUrl,
  urlLooksLikePasswordRecovery,
} from './recoveryState'
import { disableGuestPlay } from './guestPlay'

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
 * sign-out, silent token refresh, and password-recovery redirects.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ ...ANONYMOUS, status: 'LOADING' })

  useEffect(() => {
    let cancelled = false
    let sawSession = false

    if (urlLooksLikePasswordRecovery()) beginPasswordRecovery()

    const unsubscribe = onAuthStateChange((session, event) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY') {
        beginPasswordRecovery()
        clearRecoveryParamsFromUrl()
      }
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') disableGuestPlay()
      if (session) sawSession = true
      if (event === 'SIGNED_OUT') sawSession = false
      // The first callback can arrive before localStorage is read. A null
      // INITIAL_SESSION must not wipe a session that getSession restores.
      if (!session && event === 'INITIAL_SESSION') return
      setState(fromSession(session))
    })

    getSession()
      .then((session) => {
        if (cancelled) return
        if (!session && sawSession) return
        if (session) sawSession = true
        setState(fromSession(session))
      })
      .catch((cause: unknown) => {
        console.error('[auth] session restore failed:', cause)
        if (!cancelled && !sawSession) setState(ANONYMOUS)
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return state
}
