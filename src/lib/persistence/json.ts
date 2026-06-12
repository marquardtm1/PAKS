/**
 * Weg A — Export/Import als JSON-Datei.
 *
 * Universelles Fundament: funktioniert in jedem Browser (auch Firefox/Safari),
 * dient als Backup und als Geräte-Transfer ohne Cloud. Nutzt dasselbe Snapshot-
 * Format wie alle anderen Wege — eine exportierte Datei ist formatgleich mit der
 * späteren lebenden Datei (Weg B).
 *
 * Diese Datei kapselt nur die Browser-Seiteneffekte (Download/Datei lesen).
 * Die eigentliche Format-Logik liegt in format.ts.
 */
import { deserialize, serialize, type Snapshot } from './format'

/** Dateiname mit Datum, z. B. paks-export-2026-06-12.json */
export function defaultExportFilename(date = new Date()): string {
  const iso = date.toISOString().slice(0, 10)
  return `paks-export-${iso}.json`
}

/** Snapshot als JSON-Datei zum Download anbieten (Weg A: Export). */
export function downloadSnapshot(
  snapshot: Snapshot,
  filename = defaultExportFilename(),
): void {
  const blob = new Blob([serialize(snapshot)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Eine vom Nutzer gewählte Datei einlesen und als Snapshot validieren (Weg A: Import). */
export async function readSnapshotFromFile(file: File): Promise<Snapshot> {
  const text = await file.text()
  return deserialize(text)
}
