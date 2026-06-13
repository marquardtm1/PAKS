/**
 * Weg B — lebende Datendatei über die File System Access API (nur Chromium).
 *
 * Der Adapter kapselt EINEN `FileSystemFileHandle`. save() schreibt den ganzen
 * Snapshot über `createWritable()`: dabei wird in eine temporäre Kopie geschrieben
 * und beim `close()` atomar getauscht — ein Absturz mitten im Schreiben kann die
 * bestehende Datei also nicht zerstören. load() liest die Datei und validiert sie
 * über dasselbe Format wie alle anderen Wege (deserialize); eine leere/neue Datei
 * ergibt null (der Aufrufer schreibt dann den aktuellen Stand hinein).
 *
 * Der Adapter implementiert dieselbe `PersistenceAdapter`-Schnittstelle wie der
 * IndexedDB-Cache und wird vom PersistenceManager als zweite (Datei-)Senke
 * angehängt — der Store kennt weiterhin nur den Manager.
 */
import type { PersistenceAdapter, PersistenceCapabilities } from './adapter'
import { deserialize, serialize, type Snapshot } from './format'

/** true, wenn der Browser die File System Access API bereitstellt (Chromium). */
export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showOpenFilePicker' in window &&
    'showSaveFilePicker' in window
  )
}

/** AbortError = der Nutzer hat den Datei-Dialog abgebrochen (kein echter Fehler). */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Stellt sicher, dass Schreibrecht (readwrite) für den Handle besteht.
 * `request=false` fragt nur den Status ab (für den Start ohne Nutzergeste);
 * `request=true` fordert es aktiv an (nur innerhalb einer Nutzergeste erlaubt).
 */
export async function ensureReadwritePermission(
  handle: FileSystemFileHandle,
  request: boolean,
): Promise<PermissionState> {
  const descriptor: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
  const current = await handle.queryPermission(descriptor)
  if (current === 'granted') return 'granted'
  if (!request) return current
  return handle.requestPermission(descriptor)
}

/** Vorschlag für den Dateinamen beim Neuanlegen, z. B. paks-daten-2026-06-13.json */
export function defaultDataFilename(date = new Date()): string {
  return `paks-daten-${date.toISOString().slice(0, 10)}.json`
}

export class FileSystemAdapter implements PersistenceAdapter {
  readonly name = 'filesystem'
  readonly capabilities: PersistenceCapabilities = {
    livePersist: true,
    pickFile: true,
  }

  constructor(private readonly handle: FileSystemFileHandle) {}

  /** Anzeigename der Datei (z. B. für die Einstellungen). */
  get fileName(): string {
    return this.handle.name
  }

  async load(): Promise<Snapshot | null> {
    const file = await this.handle.getFile()
    const text = await file.text()
    // Neue/leere Datei: noch kein Snapshot — der Aufrufer schreibt den aktuellen.
    if (text.trim() === '') return null
    return deserialize(text)
  }

  async save(snapshot: Snapshot): Promise<void> {
    const writable = await this.handle.createWritable()
    try {
      await writable.write(serialize(snapshot))
      await writable.close()
    } catch (error) {
      // Bei Fehler die angefangene Schreibsitzung verwerfen, damit die
      // bestehende Datei unangetastet bleibt.
      try {
        await writable.abort()
      } catch {
        // abort kann selbst fehlschlagen (Handle schon weg) — irrelevant.
      }
      throw error
    }
  }
}
