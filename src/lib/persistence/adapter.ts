/**
 * Die Persistenz-Schnittstelle entkoppelt den App-Store von der konkreten
 * Quelle/Senke der Daten. Der Store kennt NUR diese Schnittstelle, nie einen
 * konkreten Speicher.
 *
 * Phase 1:   IndexedDBAdapter (Cache, läuft sofort, überall)
 * Später:    FileSystemAdapter (Weg B, lebende Datei via File System Access API)
 * Immer da:  Export/Import-JSON (Weg A) — siehe json.ts, nutzt dasselbe Format
 *
 * Der Wechsel des Adapters ist damit kein Umbau, sondern eine andere
 * Implementierung derselben drei Operationen.
 */
import type { Snapshot } from './format'

/**
 * Welche Fähigkeiten ein Adapter hat — erlaubt der UI, Funktionen bedingt
 * einzublenden (z. B. „Datei auswählen" nur bei pickFile), ohne Store-Logik
 * zu verändern.
 */
export interface PersistenceCapabilities {
  /**
   * true, wenn der Adapter Änderungen fortlaufend in eine dauerhafte Senke
   * schreibt (IndexedDB-Cache: true; ein reiner Export-Adapter: false).
   */
  livePersist: boolean
  /** true, wenn der Adapter den Nutzer eine Datei wählen lässt (Weg B). */
  pickFile: boolean
}

export interface PersistenceAdapter {
  /** Kurzer Bezeichner, v. a. für Logging/Diagnose. */
  readonly name: string
  readonly capabilities: PersistenceCapabilities

  /**
   * Lädt den vollständigen Snapshot. Gibt null zurück, wenn noch nichts
   * gespeichert ist (Erststart) — der Aufrufer seedet dann.
   */
  load(): Promise<Snapshot | null>

  /** Schreibt den vollständigen Snapshot. */
  save(snapshot: Snapshot): Promise<void>
}
