/** Exclusive founder account. Compared case-insensitively after trim. */
export const FOUNDER_EMAIL = 'yasminmyryam@gmail.com'

export function isFounderEmail(email?: string | null): boolean {
  return (email ?? '').trim().toLowerCase() === FOUNDER_EMAIL
}
