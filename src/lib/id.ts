/** Kollisionsarme lokale ID. Kein UUID-Paket nötig (lokal-only, single user). */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
