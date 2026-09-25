import { useSyncExternalStore } from 'react'

/**
 * Tracks whether the current session exists *only* to complete a password
 * reset.
 *
 * Verifying a recovery OTP returns a genuine Supabase session. Without this
 * flag the app would see "authenticated" and drop the player straight into the
 * game, skipping the new-password step entirely — which is exactly the bug
 * this module fixes.
 *
 * It deliberately lives outside React state: `Auth` sets it while `App` reads
 * it, and passing it through props would mean threading it through the very
 * component that gets unmounted when the session appears.
 *
 * Not persisted. A refresh mid-reset intentionally abandons the flow and
 * leaves the player signed in, where they can change the password from
 * Settings or start recovery again.
 */

let isRecovering = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function beginPasswordRecovery(): void {
  if (isRecovering) return
  isRecovering = true
  emit()
}

export function endPasswordRecovery(): void {
  if (!isRecovering) return
  isRecovering = false
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): boolean {
  return isRecovering
}

/** True while the player has a recovery session but has not yet set a new password. */
export function useIsRecoveringPassword(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
