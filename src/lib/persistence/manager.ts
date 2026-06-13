/**
 * Persistenz-Koordinator (Dual-Write).
 *
 * Bündelt zwei Senken hinter einer Schnittstelle:
 *   - cache:  immer vorhanden (IndexedDB) — der lokale Sicherheits-Spiegel.
 *   - file:   optional (Weg B, lebende Datei) — wird zur Laufzeit an-/abgehängt.
 *
 * Schreibmodell (entschieden): JEDE Änderung geht zuerst in den Cache und —
 * falls verbunden — zusätzlich in die Datei. Weil der Cache nie aussetzt, kann
 * ein fehlgeschlagener Datei-Schreibvorgang (Stick abgezogen, Recht verloren)
 * per Definition keine Daten verlieren: der letzte Stand liegt immer im Cache.
 *
 * Phase B0: Es wird NIE eine Datei angehängt. Damit verhält sich der Manager
 * exakt wie der bisherige reine IndexedDB-Adapter — load() liest den Cache,
 * save() schreibt den Cache. Die Datei-Pfade (attachFile/onFileError) sind
 * angelegt, aber inaktiv; Phase B1 verdrahtet den FileSystemAdapter dort hinein.
 */
import type { PersistenceAdapter } from './adapter'
import type { Snapshot } from './format'

export class PersistenceManager {
  /** Optionale Datei-Senke (Weg B). Null, solange keine Datei verbunden ist. */
  private file: PersistenceAdapter | null = null
  /**
   * Wird gerufen, wenn der Cache-Schreibvorgang gelang, der Datei-Schreibvorgang
   * aber scheiterte — der Aufrufer (Store) zeigt daraufhin das „neu verbinden"-
   * Band. In B0 nie gesetzt, weil keine Datei angehängt wird.
   */
  onFileError: ((error: unknown) => void) | null = null
  /** Beginn eines Datei-Schreibvorgangs (für den „Speichert …"-Status). */
  onFileWriteStart: (() => void) | null = null
  /** Erfolgreicher Datei-Schreibvorgang (Status „Gespeichert", Fehler-Recover). */
  onFileWriteSuccess: (() => void) | null = null

  constructor(private readonly cache: PersistenceAdapter) {}

  /** true, wenn aktuell eine lebende Datei verbunden ist (Weg B aktiv). */
  get fileAttached(): boolean {
    return this.file !== null
  }

  /** Lädt den Snapshot aus dem Cache (immer die sofort verfügbare Quelle). */
  load(): Promise<Snapshot | null> {
    return this.cache.load()
  }

  /**
   * Schreibt den Snapshot in den Cache (verpflichtend) und, falls verbunden, in
   * die Datei. Ein Cache-Fehler wird durchgereicht (der Aufrufer behandelt ihn
   * wie bisher). Ein reiner Datei-Fehler wird abgefangen und über onFileError
   * gemeldet, damit der Cache-Erfolg nicht durch das Datei-Problem verdeckt wird.
   */
  async save(snapshot: Snapshot): Promise<void> {
    await this.cache.save(snapshot)
    if (this.file) {
      this.onFileWriteStart?.()
      try {
        await this.file.save(snapshot)
        this.onFileWriteSuccess?.()
      } catch (error) {
        this.onFileError?.(error)
      }
    }
  }

  /** Datei-Senke verbinden (Weg B aktivieren). Ab jetzt schreibt save() doppelt. */
  attachFile(adapter: PersistenceAdapter): void {
    this.file = adapter
  }

  /** Datei-Senke trennen. Der Cache bleibt unberührt source of safety. */
  detachFile(): void {
    this.file = null
  }
}
