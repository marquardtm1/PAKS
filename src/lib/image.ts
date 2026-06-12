/** Bild-/Datei-Hilfsfunktionen für den Upload-Pfad. */

/** Dateiendung entfernen (letztes „.xxx"). */
function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

/** Dateiname → lesbarer Titel: Endung weg, Unterstriche/Bindestriche zu Leerzeichen. */
export function cleanFilename(name: string): string {
  return stripExtension(name)
    .replace(/[_-]+/g, ' ')
    .trim()
}

/** Ergebnis der Dateinamen-Aufteilung: Titel + (optional mehrzeilige) Notizen. */
export interface SplitFilenameResult {
  title: string
  notes: string
}

/** Einstellungen, die das Aufteilen steuern (Teilmenge der App-Settings). */
export interface FilenameSplitOptions {
  enabled: boolean
  separator: string
}

/**
 * Gemeinsame Aufteilungslogik für ALLE Import-Wege (Batch, Einzel-Upload, Paste).
 * Eine einzige Quelle der Wahrheit — keine doppelte Logik in den Modals.
 *
 * - Aus (oder leeres Trennzeichen): bisheriges Verhalten — ganzer Name (ohne
 *   Endung) wird Titel via cleanFilename, Notizen leer.
 * - An: Titel = Teil vor dem ersten Trennzeichen (getrimmt). Notizen = Rest;
 *   jedes weitere Trennzeichen wird zum Zeilenumbruch, jedes Segment getrimmt.
 *   Kein Trennzeichen im Namen → ganzer Name (ohne Endung) wird Titel, Notizen leer.
 * Die Dateiendung wird immer entfernt.
 */
export function splitFilename(
  name: string,
  { enabled, separator }: FilenameSplitOptions,
): SplitFilenameResult {
  if (!enabled || !separator) {
    return { title: cleanFilename(name), notes: '' }
  }

  const base = stripExtension(name)
  const firstIdx = base.indexOf(separator)
  if (firstIdx === -1) {
    return { title: base.trim(), notes: '' }
  }

  const title = base.slice(0, firstIdx).trim()
  const notes = base
    .slice(firstIdx + separator.length)
    .split(separator)
    .map((segment) => segment.trim())
    .join('\n')
  return { title, notes }
}

/** Eine Bilddatei als Data-URL (base64) einlesen. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
