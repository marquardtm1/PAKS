import type { DragEvent } from 'react'

/**
 * Drag & Drop von Fall-Kacheln auf Sidebar-Werte (Tagging).
 *
 * Eigener MIME-Typ, damit Drop-Ziele gezielt nur PAKS-Kachel-Drags annehmen
 * (nicht Dateien/Bilder von außerhalb) und die Sidebar normale Drags ignoriert.
 */
export const CASE_DND_MIME = 'application/x-paks-case-id'

/**
 * Eine oder mehrere Fall-IDs im Drag ablegen (Mehrfachauswahl). Als JSON-Array,
 * damit ein Drop alle gezogenen Fälle gemeinsam taggen kann.
 */
export function setCaseDragData(e: DragEvent, caseIds: string[]): void {
  e.dataTransfer.setData(CASE_DND_MIME, JSON.stringify(caseIds))
  e.dataTransfer.effectAllowed = 'copy'
}

/** Die gezogenen Fall-IDs lesen. Toleriert das alte Einzel-ID-Format. */
export function getCaseDragIds(e: DragEvent): string[] {
  const raw = e.dataTransfer.getData(CASE_DND_MIME)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    // Rückwärtskompatibel: früher wurde eine nackte ID gespeichert.
    return [raw]
  }
}

/** true, wenn der aktuelle Drag eine PAKS-Kachel trägt (für dragOver/drop-Filter). */
export function isCaseDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(CASE_DND_MIME)
}
