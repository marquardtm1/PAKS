/**
 * Reine Filter-/Such-Logik. Keine UI, kein State — nur Eingabe → Ausgabe,
 * damit sie testbar bleibt und Header/Sidebar/Grid dieselbe Quelle teilen.
 */
import type { Case } from '@/lib/types'

/** Welcher Sidebar-Filter aktiv ist. */
export type ActiveFilter =
  | { kind: 'all' }
  | { kind: 'noteonly' }
  | { kind: 'notes' }
  | { kind: 'untagged' }
  | { kind: 'group'; groupId: string; value: string }

/**
 * Ein Fall ist „ohne Tags", wenn er KEINERLEI Zuordnung trägt: keine Werte in
 * irgendeiner Tag-Gruppe und keine freien Tags. Arbeitsliste nach dem Massen-
 * import, um noch ungetaggte Fälle nachzutaggen.
 */
function isUntagged(c: Case): boolean {
  return (
    c.freeTags.length === 0 &&
    Object.values(c.groupValues).every((values) => values.length === 0)
  )
}

export function filterEquals(a: ActiveFilter, b: ActiveFilter): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'group' && b.kind === 'group') {
    return a.groupId === b.groupId && a.value === b.value
  }
  return true
}

/** Alle Suchziele eines Falls als ein Textblock (Schreibung erhalten). */
function searchableText(c: Case): string {
  const groupValues = Object.values(c.groupValues).flat()
  return [c.title, c.description, c.notes, ...c.freeTags, ...groupValues].join('\n')
}

export function filterCases(
  cases: Case[],
  query: string,
  filter: ActiveFilter,
  caseSensitive = false,
): Case[] {
  const raw = query.trim()
  // Teilwortsuche in beiden Modi; bei caseSensitive ohne Schreibungs-Normalisierung,
  // sodass „HIE" nicht im klein geschriebenen „…hie…" trifft.
  const q = caseSensitive ? raw : raw.toLowerCase()
  return cases.filter((c) => {
    if (q) {
      const text = searchableText(c)
      const haystack = caseSensitive ? text : text.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    switch (filter.kind) {
      case 'all':
        return true
      case 'noteonly':
        return c.image === null
      case 'notes':
        return c.notes.trim() !== ''
      case 'untagged':
        return isUntagged(c)
      case 'group':
        return (c.groupValues[filter.groupId] ?? []).includes(filter.value)
    }
  })
}

/** Zähler für die feststehenden Ansichts-Filter (über den gesamten Bestand). */
export interface ViewCounts {
  all: number
  noteOnly: number
  withNotes: number
  untagged: number
}

export function viewCounts(cases: Case[]): ViewCounts {
  let noteOnly = 0
  let withNotes = 0
  let untagged = 0
  for (const c of cases) {
    if (c.image === null) noteOnly++
    if (c.notes.trim() !== '') withNotes++
    if (isUntagged(c)) untagged++
  }
  return { all: cases.length, noteOnly, withNotes, untagged }
}

/** Pro Tag-Gruppe: wie oft jeder Wert vorkommt (für die Sidebar-Counts). */
export function groupValueCounts(
  cases: Case[],
  groupId: string,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const c of cases) {
    for (const value of c.groupValues[groupId] ?? []) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return counts
}
