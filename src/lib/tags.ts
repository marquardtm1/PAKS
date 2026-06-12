/**
 * Leitet die anzeigbaren Tag-Chips eines Falls ab: Gruppen-Werte werden in der
 * priorisierten Gruppenreihenfolge und in der Gruppenfarbe gezeigt, freie Tags
 * neutral dahinter.
 */
import type { Case, TagGroup } from '@/lib/types'

export interface Chip {
  label: string
  /** Hex-Farbe der Gruppe; undefined = neutraler freier Tag. */
  colorHex?: string
}

export function caseChips(c: Case, tagGroups: TagGroup[]): Chip[] {
  const ordered = [...tagGroups].sort((a, b) => a.order - b.order)
  const chips: Chip[] = []
  for (const group of ordered) {
    for (const value of c.groupValues[group.id] ?? []) {
      chips.push({ label: value, colorHex: group.colorHex })
    }
  }
  for (const tag of c.freeTags) {
    chips.push({ label: tag })
  }
  return chips
}
