import { useSyncExternalStore } from 'react'

const KEY = 'pastapoli.guestPlay'

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let guest = read()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function enableGuestPlay(): void {
  guest = true
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {}
  emit()
}

export function disableGuestPlay(): void {
  guest = false
  try {
    sessionStorage.removeItem(KEY)
  } catch {}
  emit()
}

export function useGuestPlay(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => guest,
    () => false,
  )
}
