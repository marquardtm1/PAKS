import type { Case } from './types'

/**
 * Die ausgewählten Fälle in der aktuellen Anzeige-Reihenfolge.
 * `visibleCases` ist bereits gefiltert + sortiert; durch Filtern darüber bleibt
 * die Sortierreihenfolge erhalten, und nicht mehr sichtbare (gelöschte/gefilterte)
 * Auswahl-IDs fallen automatisch heraus.
 */
export function selectionSubset(
  visibleCases: Case[],
  selectedIds: Set<string>,
): Case[] {
  return visibleCases.filter((c) => selectedIds.has(c.id))
}

/**
 * Das „aktive Set", auf das sich set-basierte Lern-/Betrachtungs-Modi beziehen
 * (Lightbox-Navigation, Diashow): liegt eine Mehrfachauswahl (>1) vor, ist es
 * die Auswahl in Anzeige-Reihenfolge; sonst das gesamte gefilterte Set. So
 * teilen Lightbox und Diashow dieselbe Set-Logik, statt zwei getrennte zu führen.
 */
export function activeSet(
  visibleCases: Case[],
  selectedIds: Set<string>,
): Case[] {
  return selectedIds.size > 1
    ? selectionSubset(visibleCases, selectedIds)
    : visibleCases
}
