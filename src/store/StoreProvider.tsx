import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { IndexedDBAdapter } from '@/lib/persistence/indexeddb'
import { PersistenceManager } from '@/lib/persistence/manager'
import {
  FileSystemAdapter,
  defaultDataFilename,
  ensureReadwritePermission,
  isAbortError,
  supportsFileSystemAccess,
} from '@/lib/persistence/filesystem'
import { clearHandle, loadHandle, saveHandle } from '@/lib/persistence/handleStore'
import type { Snapshot } from '@/lib/persistence/format'
import { createSeedSnapshot } from '@/lib/seed'
import type { Case, Settings } from '@/lib/types'

/**
 * Status der lebenden Datei (Weg B):
 *  - unsupported:     Browser kann es nicht (Firefox/Safari) → nur Weg A.
 *  - none:            unterstützt, aber keine Datei verbunden.
 *  - connected:       Datei verbunden, jede Änderung wird live hineingeschrieben.
 *  - needs-reconnect: nach Reload bekannt, aber Schreibrecht muss per Klick erneut
 *                     erteilt werden (API-Eigenheit) → Reconnect-Band.
 *  - error:           letzter Datei-Schreibvorgang scheiterte (Stick weg o. Ä.);
 *                     der IndexedDB-Spiegel hält die Daten weiterhin.
 */
export type FileStatus =
  | 'unsupported'
  | 'none'
  | 'connected'
  | 'needs-reconnect'
  | 'error'

/** Live-Status des Datei-Schreibens — für den „Speichert …/Gespeichert"-Indikator. */
export type FileSaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Auswahl im Konflikt-Dialog beim Verbinden einer abweichenden Datei. */
export type ConflictChoice = 'file' | 'local' | 'cancel'

/**
 * Daten für den Konflikt-Dialog: beide Seiten mit Fallzahl + Speicherzeit, damit
 * der Nutzer informiert entscheidet, welche Seite gewinnt (savedAt zeigt, welche
 * neuer ist). localSavedAt kann null sein, wenn lokal noch nichts gespeichert war.
 */
export interface FileConflict {
  fileName: string
  fileCaseCount: number
  fileSavedAt: string
  localCaseCount: number
  localSavedAt: string | null
}

/** Lesbare Fehlermeldung aus einem unbekannten Fehlerwert. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Verify-Gate: schreibt den Snapshot und liest ihn sofort zurück, um zu
 * bestätigen, dass der Schreibvorgang physisch und vollständig gelandet ist,
 * BEVOR die Datei als verlässliche Senke gilt. Vergleicht die Fall- und
 * Gruppen-Anzahl (günstig; ein voller Byte-Vergleich wäre bei Hunderten MB
 * Bilddaten zu teuer). Wirft bei Abweichung.
 */
async function writeAndVerify(
  adapter: FileSystemAdapter,
  snapshot: Snapshot,
): Promise<void> {
  await adapter.save(snapshot)
  const readBack = await adapter.load()
  if (
    !readBack ||
    readBack.cases.length !== snapshot.cases.length ||
    readBack.tagGroups.length !== snapshot.tagGroups.length
  ) {
    throw new Error(
      'Überprüfung nach dem Schreiben fehlgeschlagen — die Datei ist unvollständig.',
    )
  }
}

/**
 * Günstige Heuristik, ob sich Datei-Inhalt und aktueller Stand unterscheiden:
 * Fallzahl + Tag-Gruppen. Bewusst KEIN tiefer Inhalts-/Bildvergleich (zu teuer
 * bei Hunderten MB Bilddaten). Bei „unterscheidet sich" entscheidet der Nutzer
 * im Konflikt-Dialog (savedAt-informiert); ein gleich-langer Inhaltsedit bleibt
 * als bewusste Grenze unerkannt (echtes Merge wäre B3).
 */
function snapshotsDiffer(a: Snapshot, b: Snapshot): boolean {
  return (
    a.cases.length !== b.cases.length ||
    JSON.stringify(a.tagGroups) !== JSON.stringify(b.tagGroups)
  )
}

/**
 * Zentraler App-Store. Hält den geladenen Snapshot und kapselt den einzigen
 * Schreibpfad in die Persistenz. Die UI kennt nur diesen Store, nie den
 * konkreten Adapter — der Wechsel auf Weg B (lebende Datei) bleibt eine reine
 * Adapter-Frage.
 *
 * applyMutation() ist die gemeinsame Grundlage für alle künftigen Änderungen
 * (Add/Edit/Delete, Tag-Gruppen): es nimmt eine reine Snapshot→Snapshot-
 * Funktion, aktualisiert den State und persistiert (debounced).
 */

type Status = 'loading' | 'ready' | 'error'

interface StoreValue {
  status: Status
  error: string | null
  snapshot: Snapshot | null
  /**
   * Reine Transformation des Snapshots; State-Update + Persistenz erledigt der
   * Store. Standardmäßig wird der vorherige Zustand für Undo gemerkt; reine
   * Settings-Änderungen schalten das per `recordUndo: false` ab.
   */
  applyMutation: (
    fn: (current: Snapshot) => Snapshot,
    opts?: { recordUndo?: boolean; label?: string },
  ) => void
  /** Teil-Update der Settings (theme, sidebarWidth, disclaimer …). Nicht undobar. */
  updateSettings: (patch: Partial<Settings>) => void
  acceptDisclaimer: () => void
  /** Neuen Fall (oder reine Notiz) vorne einfügen. */
  addCase: (c: Case) => void
  /** Felder eines Falls überschreiben; updated wird gesetzt. */
  updateCase: (id: string, patch: Partial<Case>) => void
  /** Fall löschen. */
  deleteCase: (id: string) => void
  /** true, wenn der Undo-Stack mindestens einen Schritt enthält. */
  canUndo: boolean
  /**
   * Letzte Datenänderung rückgängig machen (Settings bleiben unberührt). Gibt
   * das Label der zurückgenommenen Aktion zurück (für eine Rückmeldung), oder
   * null, wenn der Verlauf leer war.
   */
  undo: () => string | null
  /** true, wenn der Redo-Stack mindestens einen Schritt enthält. */
  canRedo: boolean
  /**
   * Zuletzt rückgängig gemachte Änderung wiederherstellen (Gegenstück zu undo).
   * Gibt das Label der wiederhergestellten Aktion zurück, oder null, wenn nichts
   * wiederherzustellen ist.
   */
  redo: () => string | null

  // ── Weg B: lebende Datendatei ──────────────────────────────────────────────
  /** Aktueller Zustand der Datei-Anbindung. */
  fileStatus: FileStatus
  /** Name der verbundenen/zuletzt bekannten Datei (für die Anzeige). */
  fileName: string | null
  /** Letzte Datei-Fehlermeldung (bei fileStatus 'error'). */
  fileError: string | null
  /** Neue Datendatei anlegen und den aktuellen Stand hineinschreiben (Migration). */
  connectNewFile: () => Promise<void>
  /** Bestehende Datendatei öffnen und verbinden. */
  openExistingFile: () => Promise<void>
  /** Schreibrecht nach Reload erneut erteilen und Datei wieder anbinden. */
  reconnectFile: () => Promise<void>
  /** Datei-Anbindung lösen (Cache/IndexedDB bleibt source of safety). */
  disconnectFile: () => Promise<void>
  /** Live-Status des Datei-Schreibens (für den Indikator in der Kopfzeile). */
  fileSaveState: FileSaveState
  /** Offener Konflikt beim Verbinden (null = keiner) → Konflikt-Dialog. */
  conflict: FileConflict | null
  /** Entscheidung im Konflikt-Dialog zurückmelden. */
  resolveConflict: (choice: ConflictChoice) => void
}

/** Ein Undo-Schritt: voriger Zustand + Label der Aktion, die ihn ablöste. */
interface UndoEntry {
  snapshot: Snapshot
  label: string
}

const StoreContext = createContext<StoreValue | null>(null)

// Persistenz wird hier (und nur hier) zusammengesetzt. B0: nur der IndexedDB-
// Cache als Senke — der PersistenceManager hält bereits den Dual-Write-Pfad
// bereit, an den B1 die lebende Datei (Weg B) anhängt, ohne den Store zu ändern.
const persistence = new PersistenceManager(new IndexedDBAdapter())

const SAVE_DEBOUNCE_MS = 400

/**
 * Wie viele Schritte der Undo-Ringpuffer hält. Bewusst klein: jeder Eintrag ist
 * ein voller Snapshot. Dank unveränderlicher Updates (Spread) teilen sich diese
 * Snapshots unveränderte Fall-Objekte inkl. base64-Bilder per Referenz — der
 * Speicher-Aufwand ist also der Diff, nicht N Vollkopien. Das Limit begrenzt vor
 * allem, wie lange gelöschte Bilder noch referenziert (und damit im RAM) bleiben.
 */
const UNDO_LIMIT = 5

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<Snapshot | null>(null)

  // Synchroner Spiegel des aktuellen Snapshots: erlaubt applyMutation, den
  // „current"-Zustand zu lesen, ohne einen Seiteneffekt im setState-Updater zu
  // brauchen (der unter StrictMode doppelt liefe und den Undo-Stack verdoppelte).
  const snapshotRef = useRef<Snapshot | null>(null)
  // Undo-Ringpuffer: vorherige Zustände + Aktionslabel, jüngster zuletzt (LIFO).
  const undoStack = useRef<UndoEntry[]>([])
  const [canUndo, setCanUndo] = useState(false)
  // Redo-Ringpuffer: per undo zurückgenommene Zustände, jüngster zuletzt. Wird
  // von jeder echten (undobaren) Mutation gekappt — siehe applyMutation.
  const redoStack = useRef<UndoEntry[]>([])
  const [canRedo, setCanRedo] = useState(false)

  // ── Weg B: lebende Datei ──────────────────────────────────────────────────
  const [fileStatus, setFileStatus] = useState<FileStatus>(() =>
    supportsFileSystemAccess() ? 'none' : 'unsupported',
  )
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileSaveState, setFileSaveState] = useState<FileSaveState>('idle')
  // Offener Konflikt-Dialog + Resolver, der die Nutzerauswahl an den wartenden
  // Verbindungs-Ablauf zurückgibt (Brücke async-Logik ↔ React-Modal).
  const [conflict, setConflict] = useState<FileConflict | null>(null)
  const conflictResolver = useRef<((choice: ConflictChoice) => void) | null>(null)
  // Zeitpunkt der letzten lokalen Speicherung (für den savedAt-Vergleich im
  // Konflikt-Dialog). Wird beim Laden gesetzt und bei jeder Änderung aktualisiert.
  const localSavedAtRef = useRef<string | null>(null)
  // Verhindert ein doppeltes Wiederherstellen unter StrictMode (Ref überlebt das
  // simulierte Doppel-Mount, anders als der Effekt selbst).
  const fileRestoreAttempted = useRef(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        let loaded = await persistence.load()
        if (!loaded) {
          loaded = createSeedSnapshot()
          await persistence.save(loaded)
        }
        if (!active) return
        snapshotRef.current = loaded
        localSavedAtRef.current = loaded.savedAt
        setSnapshot(loaded)
        setStatus('ready')
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  // Debounced Persistenz: schnelle aufeinanderfolgende Änderungen werden zu
  // einem Schreibvorgang zusammengefasst.
  const schedulePersist = useCallback((next: Snapshot) => {
    // Jede Änderung markiert „lokal zuletzt geändert" — Vergleichszeit gegen die
    // Datei-savedAt im Konflikt-Dialog.
    localSavedAtRef.current = new Date().toISOString()
    pending.current = next
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const toSave = pending.current
      if (toSave) void persistence.save(toSave)
    }, SAVE_DEBOUNCE_MS)
  }, [])

  const applyMutation = useCallback(
    (
      fn: (current: Snapshot) => Snapshot,
      opts?: { recordUndo?: boolean; label?: string },
    ) => {
      const current = snapshotRef.current
      if (!current) return
      const next = fn(current)
      if (next === current) return

      // Vorherigen Zustand + Aktionslabel in den Ringpuffer legen (außer bei
      // reinen Settings-Änderungen). Referenz genügt — unveränderte Fälle
      // werden geteilt.
      if (opts?.recordUndo !== false) {
        const stack = undoStack.current
        stack.push({ snapshot: current, label: opts?.label ?? 'Änderung' })
        if (stack.length > UNDO_LIMIT) stack.shift()
        setCanUndo(true)
        // Eine neue echte Mutation kappt den Redo-Pfad — sonst entstünden
        // widersprüchliche Historien (Redo würde in einen abgezweigten Ast
        // zurückführen). undo/redo selbst umgehen applyMutation und lösen das
        // daher NICHT aus.
        if (redoStack.current.length > 0) {
          redoStack.current = []
          setCanRedo(false)
        }
      }

      snapshotRef.current = next
      setSnapshot(next)
      schedulePersist(next)
    },
    [schedulePersist],
  )

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      // Settings sind nicht Teil des Undo-Verlaufs (Theme/Sortierung/… sollen
      // nicht den Stack füllen oder von Strg+Z erfasst werden).
      applyMutation(
        (current) => ({
          ...current,
          settings: { ...current.settings, ...patch } satisfies Settings,
        }),
        { recordUndo: false },
      )
    },
    [applyMutation],
  )

  const undo = useCallback((): string | null => {
    const stack = undoStack.current
    const entry = stack.pop()
    if (!entry) return null
    // Nur Daten (Fälle, Tag-Gruppen) zurücksetzen; die AKTUELLEN Settings
    // behalten, damit ein zwischenzeitlicher Theme-/Sortierwechsel nicht
    // mit zurückgedreht wird.
    const current = snapshotRef.current
    // Aktuellen Stand für ein späteres Redo sichern (statt verwerfen). Das Label
    // der rückgenommenen Aktion wandert mit, damit der Redo-Toast dazu passt.
    if (current) {
      redoStack.current.push({ snapshot: current, label: entry.label })
      if (redoStack.current.length > UNDO_LIMIT) redoStack.current.shift()
      setCanRedo(true)
    }
    const restored: Snapshot = current
      ? { ...entry.snapshot, settings: current.settings }
      : entry.snapshot
    snapshotRef.current = restored
    setSnapshot(restored)
    schedulePersist(restored)
    setCanUndo(stack.length > 0)
    return entry.label
  }, [schedulePersist])

  // Gegenstück zu undo: holt den zuletzt rückgenommenen Zustand zurück und legt
  // den aktuellen Stand wieder auf den Undo-Stack. Umgeht — wie undo — bewusst
  // applyMutation, damit das Zurückschieben den Redo-Pfad nicht kappt.
  const redo = useCallback((): string | null => {
    const entry = redoStack.current.pop()
    if (!entry) return null
    const current = snapshotRef.current
    if (current) {
      undoStack.current.push({ snapshot: current, label: entry.label })
      if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift()
      setCanUndo(true)
    }
    const restored: Snapshot = current
      ? { ...entry.snapshot, settings: current.settings }
      : entry.snapshot
    snapshotRef.current = restored
    setSnapshot(restored)
    schedulePersist(restored)
    setCanRedo(redoStack.current.length > 0)
    return entry.label
  }, [schedulePersist])

  // Datei-Schreibfehler (z. B. Stick abgezogen): nur Status setzen — der Cache-
  // Spiegel hat den Stand bereits, es gehen keine Daten verloren.
  const handleFileError = useCallback((e: unknown) => {
    setFileStatus('error')
    setFileError(errorMessage(e))
    setFileSaveState('error')
  }, [])

  // Manager-Callbacks einmal verdrahten. Sie feuern nur, wenn eine Datei
  // angehängt ist (der Manager prüft das). onFileWriteSuccess hebt einen vorigen
  // Schreibfehler auf (Auto-Recover, sobald der Stick wieder da ist).
  useEffect(() => {
    persistence.onFileError = handleFileError
    persistence.onFileWriteStart = () => setFileSaveState('saving')
    persistence.onFileWriteSuccess = () => {
      setFileSaveState('saved')
      setFileStatus((s) => (s === 'error' ? 'connected' : s))
      setFileError(null)
    }
    return () => {
      persistence.onFileError = null
      persistence.onFileWriteStart = null
      persistence.onFileWriteSuccess = null
    }
  }, [handleFileError])

  // Konflikt-Dialog als Promise: setzt den Dialog-State und wartet auf die
  // Auswahl des Nutzers (Brücke zwischen async-Verbindungsablauf und Modal).
  const askConflict = useCallback((info: FileConflict): Promise<ConflictChoice> => {
    return new Promise((resolve) => {
      conflictResolver.current = resolve
      setConflict(info)
    })
  }, [])

  const resolveConflict = useCallback((choice: ConflictChoice) => {
    setConflict(null)
    const resolve = conflictResolver.current
    conflictResolver.current = null
    resolve?.(choice)
  }, [])

  // Eine bereits berechtigte Datei anbinden: Inhalt mit dem aktuellen Stand
  // abgleichen, bei Abweichung den Konflikt-Dialog (savedAt-informiert) zeigen,
  // dann attachen. Gibt true zurück, wenn angebunden wurde (false = abgebrochen).
  // Geteilt von activateHandle (Reconnect/Start) und openExistingFile.
  const reconcileAndAttach = useCallback(
    async (
      adapter: FileSystemAdapter,
      handle: FileSystemFileHandle,
    ): Promise<boolean> => {
      const current = snapshotRef.current
      if (!current) return false
      const fileSnap = await adapter.load()
      if (fileSnap == null) {
        // Leere/neue Datei → aktuellen Stand hineinschreiben (mit Verify).
        await writeAndVerify(adapter, current)
      } else if (snapshotsDiffer(fileSnap, current)) {
        const choice = await askConflict({
          fileName: handle.name,
          fileCaseCount: fileSnap.cases.length,
          fileSavedAt: fileSnap.savedAt,
          localCaseCount: current.cases.length,
          localSavedAt: localSavedAtRef.current,
        })
        if (choice === 'cancel') return false
        if (choice === 'file') {
          applyMutation(() => fileSnap, {
            recordUndo: false,
            label: 'Datendatei geladen',
          })
        } else {
          await writeAndVerify(adapter, current)
        }
      }
      // (Gleicher Stand → direkt anbinden, ohne zu schreiben.)
      persistence.attachFile(adapter)
      setFileName(handle.name)
      setFileError(null)
      setFileSaveState('saved')
      setFileStatus('connected')
      return true
    },
    [applyMutation, askConflict],
  )

  // Bereits berechtigte Datei (Reconnect/Start) anbinden.
  const activateHandle = useCallback(
    async (handle: FileSystemFileHandle) => {
      await reconcileAndAttach(new FileSystemAdapter(handle), handle)
    },
    [reconcileAndAttach],
  )

  // Neue Datendatei anlegen und den aktuellen Stand hineinschreiben (Migration
  // des Bestands). Die Quelle (IndexedDB) bleibt unangetastet, bis das Verify-
  // Gate den Schreibvorgang bestätigt hat.
  const connectNewFile = useCallback(async () => {
    if (!supportsFileSystemAccess()) return
    const current = snapshotRef.current
    if (!current) return
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultDataFilename(),
        types: [
          { description: 'PAKS-Datendatei', accept: { 'application/json': ['.json'] } },
        ],
      })
      const adapter = new FileSystemAdapter(handle)
      await writeAndVerify(adapter, current)
      await saveHandle(handle)
      persistence.attachFile(adapter)
      setFileName(handle.name)
      setFileError(null)
      setFileSaveState('saved')
      setFileStatus('connected')
    } catch (e) {
      if (isAbortError(e)) return
      setFileError(errorMessage(e))
      window.alert('Datei konnte nicht angelegt werden: ' + errorMessage(e))
    }
  }, [])

  // Bestehende Datei öffnen: Schreibrecht anfordern, dann über reconcileAndAttach
  // abgleichen/anbinden (bei Abweichung Konflikt-Dialog).
  const openExistingFile = useCallback(async () => {
    if (!supportsFileSystemAccess()) return
    const current = snapshotRef.current
    if (!current) return
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          { description: 'PAKS-Datendatei', accept: { 'application/json': ['.json'] } },
        ],
      })
      if (!handle) return
      const permission = await ensureReadwritePermission(handle, true)
      if (permission !== 'granted') {
        setFileError('Schreibrecht für die Datei wurde nicht erteilt.')
        window.alert('Ohne Schreibrecht kann die Datei nicht als lebende Datei dienen.')
        return
      }
      const attached = await reconcileAndAttach(new FileSystemAdapter(handle), handle)
      if (attached) await saveHandle(handle)
    } catch (e) {
      if (isAbortError(e)) return
      setFileError(errorMessage(e))
      window.alert('Datei konnte nicht geöffnet werden: ' + errorMessage(e))
    }
  }, [reconcileAndAttach])

  // Nach Reload: Schreibrecht erneut anfordern (braucht die Nutzergeste dieses
  // Klicks) und die zuletzt verbundene Datei wieder anbinden.
  const reconnectFile = useCallback(async () => {
    try {
      const handle = await loadHandle()
      if (!handle) {
        setFileStatus('none')
        setFileName(null)
        return
      }
      const permission = await ensureReadwritePermission(handle, true)
      if (permission !== 'granted') {
        setFileName(handle.name)
        setFileStatus('needs-reconnect')
        return
      }
      await activateHandle(handle)
    } catch (e) {
      setFileError(errorMessage(e))
      setFileStatus('error')
    }
  }, [activateHandle])

  // Anbindung lösen: Datei-Senke abhängen und die gemerkte Datei vergessen. Der
  // IndexedDB-Spiegel trägt die Daten unverändert weiter. Die Manager-Callbacks
  // bleiben gesetzt (sie feuern ohne angehängte Datei ohnehin nicht).
  const disconnectFile = useCallback(async () => {
    persistence.detachFile()
    await clearHandle()
    setFileName(null)
    setFileError(null)
    setFileSaveState('idle')
    setFileStatus(supportsFileSystemAccess() ? 'none' : 'unsupported')
  }, [])

  // Nach dem Cache-Load (status 'ready'): zuvor verbundene Datei wiederherstellen.
  // Ohne Nutzergeste lässt sich das Schreibrecht nicht erzwingen — ist es nicht
  // (mehr) erteilt, wird das Reconnect-Band gezeigt (needs-reconnect). Die App
  // läuft derweil voll aus dem Cache. Nur einmal versucht (fileRestoreAttempted).
  useEffect(() => {
    if (status !== 'ready' || fileRestoreAttempted.current) return
    fileRestoreAttempted.current = true
    if (!supportsFileSystemAccess()) return
    let active = true
    void (async () => {
      try {
        const handle = await loadHandle()
        if (!handle || !active) return
        const permission = await ensureReadwritePermission(handle, false)
        if (!active) return
        if (permission === 'granted') {
          await activateHandle(handle)
        } else {
          setFileName(handle.name)
          setFileStatus('needs-reconnect')
        }
      } catch (e) {
        if (active) {
          setFileError(errorMessage(e))
          setFileStatus('error')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [status, activateHandle])

  const acceptDisclaimer = useCallback(() => {
    updateSettings({ disclaimerAccepted: true })
  }, [updateSettings])

  const addCase = useCallback(
    (c: Case) => {
      applyMutation((current) => ({ ...current, cases: [c, ...current.cases] }), {
        label:
          c.videoData || c.videoPath
            ? 'Video angelegt'
            : c.image === null
              ? 'Notiz angelegt'
              : 'Fall angelegt',
      })
    },
    [applyMutation],
  )

  const updateCase = useCallback(
    (id: string, patch: Partial<Case>) => {
      applyMutation(
        (current) => ({
          ...current,
          cases: current.cases.map((c) =>
            c.id === id ? { ...c, ...patch, updated: Date.now() } : c,
          ),
        }),
        { label: 'Fall bearbeitet' },
      )
    },
    [applyMutation],
  )

  const deleteCase = useCallback(
    (id: string) => {
      applyMutation(
        (current) => ({
          ...current,
          cases: current.cases.filter((c) => c.id !== id),
        }),
        { label: 'Fall gelöscht' },
      )
    },
    [applyMutation],
  )

  // Farbschema aufs Dokument anwenden. Wichtig: solange der Snapshot noch lädt
  // (theme === undefined), das Attribut NICHT anfassen — sonst überschreibt der
  // Mount-Lauf den vom Inline-Skript (index.html) korrekt gesetzten Wert mit dem
  // Default und erzeugt genau den Flash, den das Inline-Skript verhindern soll.
  // localStorage-Spiegel hält das Inline-Skript beim nächsten Reload aktuell.
  useEffect(() => {
    const theme = snapshot?.settings.theme
    if (!theme) return
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('paks-theme', theme)
    } catch {
      // localStorage kann in Privacy-Modi werfen — Snapshot bleibt maßgeblich.
    }
  }, [snapshot?.settings.theme])

  return (
    <StoreContext
      value={{
        status,
        error,
        snapshot,
        applyMutation,
        updateSettings,
        acceptDisclaimer,
        addCase,
        updateCase,
        deleteCase,
        canUndo,
        undo,
        canRedo,
        redo,
        fileStatus,
        fileName,
        fileError,
        connectNewFile,
        openExistingFile,
        reconnectFile,
        disconnectFile,
        fileSaveState,
        conflict,
        resolveConflict,
      }}
    >
      {children}
    </StoreContext>
  )
}

export function useStore(): StoreValue {
  const value = use(StoreContext)
  if (!value) throw new Error('useStore muss innerhalb von <StoreProvider> verwendet werden.')
  return value
}
