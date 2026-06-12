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
import type { PersistenceAdapter } from '@/lib/persistence/adapter'
import type { Snapshot } from '@/lib/persistence/format'
import { createSeedSnapshot } from '@/lib/seed'
import type { Case, Settings } from '@/lib/types'

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
}

/** Ein Undo-Schritt: voriger Zustand + Label der Aktion, die ihn ablöste. */
interface UndoEntry {
  snapshot: Snapshot
  label: string
}

const StoreContext = createContext<StoreValue | null>(null)

// Konkreter Adapter wird hier (und nur hier) gewählt. Phase 1: IndexedDB-Cache.
const adapter: PersistenceAdapter = new IndexedDBAdapter()

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

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        let loaded = await adapter.load()
        if (!loaded) {
          loaded = createSeedSnapshot()
          await adapter.save(loaded)
        }
        if (!active) return
        snapshotRef.current = loaded
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
    pending.current = next
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const toSave = pending.current
      if (toSave) void adapter.save(toSave)
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
    const restored: Snapshot = current
      ? { ...entry.snapshot, settings: current.settings }
      : entry.snapshot
    snapshotRef.current = restored
    setSnapshot(restored)
    schedulePersist(restored)
    setCanUndo(stack.length > 0)
    return entry.label
  }, [schedulePersist])

  const acceptDisclaimer = useCallback(() => {
    updateSettings({ disclaimerAccepted: true })
  }, [updateSettings])

  const addCase = useCallback(
    (c: Case) => {
      applyMutation((current) => ({ ...current, cases: [c, ...current.cases] }), {
        label: c.image === null ? 'Notiz angelegt' : 'Fall angelegt',
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
