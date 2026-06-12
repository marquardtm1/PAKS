/**
 * Reine Sortier-Logik fürs Hauptgrid. Keine UI, kein State — Eingabe → Ausgabe,
 * damit Grid und Vollbild-Navigation exakt dieselbe Reihenfolge teilen.
 */
import type { Case, SortKey, SortDir } from '@/lib/types'

/** Maßgebliches Datum eines Falls: echtes Dateidatum, sonst Erstellzeitpunkt. */
export function caseDate(c: Case): number {
  return c.fileModified ?? c.created
}

/**
 * Sortiert eine Kopie der Fälle nach Schlüssel + Richtung.
 * - 'title': alphabetisch nach Titel (locale-bewusst, de, Groß/Klein egal).
 * - 'date': nach echtem Dateidatum (Fallback Erstellzeitpunkt).
 * Stabiler Tie-Break über die ID, damit die Reihenfolge bei Gleichstand fest ist.
 */
export function sortCases(cases: Case[], key: SortKey, dir: SortDir): Case[] {
  const factor = dir === 'asc' ? 1 : -1
  return [...cases].sort((a, b) => {
    let cmp: number
    if (key === 'title') {
      cmp = a.title.localeCompare(b.title, 'de', { sensitivity: 'base' })
    } else {
      cmp = caseDate(a) - caseDate(b)
    }
    if (cmp === 0) cmp = a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    return cmp * factor
  })
}
