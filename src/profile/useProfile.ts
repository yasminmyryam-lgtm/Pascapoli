import { useCallback, useEffect, useState } from 'react'
import { toAuthError } from '../auth/errors'
import { fetchProfile, updateUsername, type Profile } from './profileService'

export type ProfileState = {
  profile: Profile | null
  isLoading: boolean
  error: string | null
  /** Saves a new username. Resolves true on success. */
  rename: (next: string) => Promise<boolean>
}

/**
 * Loads the signed-in player's profile and exposes a rename action.
 *
 * Pass `null` when signed out so the previous player's name never lingers on
 * screen after an account switch.
 */
export function useProfile(userId: string | null): ProfileState {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchProfile(userId)
      .then((result) => {
        if (!cancelled) setProfile(result)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toAuthError(cause).message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  const rename = useCallback(
    async (next: string): Promise<boolean> => {
      if (!userId) return false
      setIsLoading(true)
      setError(null)
      try {
        setProfile(await updateUsername(userId, next))
        return true
      } catch (cause) {
        setError(toAuthError(cause).message)
        return false
      } finally {
        setIsLoading(false)
      }
    },
    [userId],
  )

  return { profile, isLoading, error, rename }
}
