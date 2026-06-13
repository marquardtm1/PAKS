import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store/StoreProvider'
import { uid } from '@/lib/id'
import { filterCases, type ActiveFilter } from '@/lib/filter'
import { sortCases } from '@/lib/sort'
import { setCaseDragData } from '@/lib/dnd'
import type { Case, SortDir, SortKey } from '@/lib/types'
import { Header } from './Header'
import { FileReconnectBanner } from './FileReconnectBanner'
import { ConflictDialog } from './ConflictDialog'
import { Sidebar } from './Sidebar'
import { ResizableSidebar } from './ResizableSidebar'
import { CaseGrid, type ViewMode } from './CaseGrid'
import { DisclaimerBanner } from './DisclaimerBanner'
import { CaseFormModal, type NewCaseInput } from './CaseFormModal'
import { Lightbox } from './Lightbox'
import { Slideshow } from './Slideshow'
import { SettingsModal } from './SettingsModal'
import { BatchImportModal } from './BatchImportModal'
import { DuplicatesModal } from './DuplicatesModal'

/**
 * App-Shell: verbindet Store (Daten) mit der UI-Zustandsschicht (Suche, Filter,
 * Ansicht) und ordnet Header / Sidebar / Hauptfeld an. Read-only — Add/Edit,
 * Detail-Ansicht, Diashow und Galerie folgen in späteren Schritten.
 */
export function AppShell() {
  const {
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
    fileStatus,
    fileName,
    fileError,
    reconnectFile,
    conflict,
    resolveConflict,
  } = useStore()

  // UI-Zustand lebt hier (shell-lokal), nicht im persistierten Snapshot.
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ActiveFilter>({ kind: 'all' })
  const [view, setView] = useState<ViewMode>('grid')
  // Neuanlegen öffnet das Formular auf dem Default-Register (Bild); andere
  // Register sind im Modal per Tab erreichbar.
  const [addOpen, setAddOpen] = useState(false)
  // Vollbild-Ansicht: Position im aktuell gefilterten+sortierten Set (nicht
  // Fall-ID, damit Pfeil-Navigation direkt darauf arbeitet).
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  // Fall, der gerade bearbeitet wird (Edit-Maske über der Vollbild-Ansicht).
  const [editCase, setEditCase] = useState<Case | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [duplicatesOpen, setDuplicatesOpen] = useState(false)
  // Diashow läuft über das beim Öffnen eingefrorene, bild-only Set (null = zu).
  const [slideshowCases, setSlideshowCases] = useState<Case[] | null>(null)
  // Mehrfachauswahl im Grid (UI-State, nicht persistiert). anchor = Bezugskachel
  // für Shift-Bereichsauswahl.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  // Kurzer Hinweis (Toast), z. B. nach einem Undo. id erzwingt Neustart des
  // Auto-Ausblendens auch bei identischem Text.
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)

  // Sidebar-Breite: lokal für flüssiges Drag, initial aus den Settings,
  // beim Loslassen zurück in die Settings persistiert.
  const persistedWidth = snapshot?.settings.sidebarWidth
  const [sidebarWidth, setSidebarWidth] = useState(persistedWidth ?? 220)
  useEffect(() => {
    if (persistedWidth != null) setSidebarWidth(persistedWidth)
  }, [persistedWidth])

  // Höhe der unteren Befehlszone in der Sidebar (verstellbare Trennlinie). Das
  // flüssige Drag passiert in der Sidebar direkt am DOM; hier nur der
  // persistierte Wert, der als Anfangshöhe einfließt.
  const sidebarBottomHeight = snapshot?.settings.sidebarBottomHeight ?? 232

  // Gefiltert, dann sortiert. Dieselbe Reihenfolge speist Grid, Bereichsauswahl
  // (Shift) und Vollbild-Navigation — eine einzige Quelle der Anzeigereihenfolge.
  const sortKey = snapshot?.settings.sortKey ?? 'date'
  const sortDir = snapshot?.settings.sortDir ?? 'desc'
  const caseSensitive = snapshot?.settings.searchCaseSensitive ?? false
  const visibleCases = useMemo(() => {
    if (!snapshot) return []
    return sortCases(
      filterCases(snapshot.cases, query, filter, caseSensitive),
      sortKey,
      sortDir,
    )
  }, [snapshot, query, filter, caseSensitive, sortKey, sortDir])

  // Vollbild-Index gültig halten, wenn sich das Set ändert (Filter, Suche,
  // Sortierung, Löschen): leeres Set → schließen; Index außerhalb → ans Ende.
  useEffect(() => {
    if (viewerIndex === null) return
    if (visibleCases.length === 0) setViewerIndex(null)
    else if (viewerIndex >= visibleCases.length)
      setViewerIndex(visibleCases.length - 1)
  }, [viewerIndex, visibleCases])

  // Auswahl zurücksetzen, wenn sich das sichtbare Set durch Filter/Suche ändert —
  // sonst blieben unsichtbare Fälle ausgewählt und würden von Entf miterfasst.
  useEffect(() => {
    setSelectedIds(new Set())
    setAnchorId(null)
  }, [filter, query])

  // Auto-Ausblenden des Toasts.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // Rückgängigmachen samt Rückmeldung. Ein Pfad für Strg+Z und Button: undo()
  // liefert das Label der zurückgenommenen Aktion, das als Toast erscheint.
  const runUndo = useCallback(() => {
    const label = undo()
    setSelectedIds(new Set())
    setAnchorId(null)
    if (label) setToast({ text: `Rückgängig: ${label}`, id: Date.now() })
  }, [undo])

  // Tastatur im Grid-Kontext: Entf löscht die Auswahl, Strg/Cmd+Z macht die
  // letzte Datenänderung rückgängig. Gemeinsame Guards: nicht bei offenem
  // Overlay und nicht während Texteingaben (Input/Textarea/contenteditable).
  const overlayOpen =
    viewerIndex !== null || addOpen || editCase !== null ||
    settingsOpen || importOpen || duplicatesOpen || conflict !== null ||
    slideshowCases !== null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlayOpen) return
      const el = document.activeElement as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      )
        return

      if (e.key === 'Escape') {
        // Rangfolge: Offene Overlays fangen Esc selbst ab (sie schließen sich)
        // und werden vom overlayOpen-Guard oben ausgeschlossen, bevor wir hier
        // ankommen. Hier landet Esc also nur ohne Overlay/Texteingabe — dann
        // hebt es eine bestehende Mehrfachauswahl auf.
        if (selectedIds.size === 0) return
        e.preventDefault()
        setSelectedIds(new Set())
        setAnchorId(null)
      } else if (e.key === 'Delete') {
        if (selectedIds.size === 0) return
        e.preventDefault()
        const n = selectedIds.size
        if (window.confirm(`${n} ${n === 1 ? 'Fall' : 'Fälle'} löschen?`)) {
          const ids = selectedIds
          applyMutation(
            (s) => ({ ...s, cases: s.cases.filter((c) => !ids.has(c.id)) }),
            { label: n === 1 ? 'Fall gelöscht' : `Löschen von ${n} Fällen` },
          )
          setSelectedIds(new Set())
          setAnchorId(null)
        }
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'a'
      ) {
        // Strg+A markiert ausschließlich das aktuell sichtbare (gefilterte +
        // gesuchte) Set — NICHT den ganzen Bestand. Die Guards oben verhindern,
        // dass wir hier die native Text-Markierung in Such-/Eingabefeldern
        // kapern. preventDefault unterdrückt die Browser-Volltextmarkierung.
        if (visibleCases.length === 0) return
        e.preventDefault()
        setSelectedIds(new Set(visibleCases.map((c) => c.id)))
        setAnchorId(null)
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'z'
      ) {
        // Strg+Shift+Z (Redo) bewusst ignoriert — kein Redo vorgesehen.
        if (!canUndo) return
        e.preventDefault()
        runUndo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [overlayOpen, selectedIds, visibleCases, applyMutation, canUndo, runUndo])

  if (status === 'loading') {
    return <CenterMessage>Lade Daten …</CenterMessage>
  }
  if (status === 'error' || !snapshot) {
    return (
      <CenterMessage tone="danger">
        Fehler beim Laden: {error ?? 'unbekannt'}
      </CenterMessage>
    )
  }

  const toggleTheme = () =>
    updateSettings({ theme: snapshot.settings.theme === 'dark' ? 'light' : 'dark' })

  const commitSidebarWidth = (width: number) => {
    setSidebarWidth(width)
    updateSettings({ sidebarWidth: width })
  }

  const handleCreate = (data: NewCaseInput) => {
    const now = Date.now()
    addCase({ id: uid(), ...data, created: now, updated: now })
  }

  // Batch-Import: alle neuen Fälle in EINEM applyMutation einfügen (ein Persist).
  const handleBatchImport = (inputs: NewCaseInput[]) => {
    if (!inputs.length) return
    const now = Date.now()
    const newCases = inputs.map((d, i) => ({
      id: uid(),
      ...d,
      created: now + i,
      updated: now + i,
    }))
    // In Auswahlreihenfolge oben einfügen (erstes Bild zuerst).
    applyMutation((s) => ({ ...s, cases: [...newCases, ...s.cases] }), {
      label:
        newCases.length === 1
          ? 'Fall importiert'
          : `Import von ${newCases.length} Fällen`,
    })
  }

  // Doppelklick → Vollbild-Ansicht an der Position des Falls im sortierten Set.
  const openViewer = (id: string) => {
    const i = visibleCases.findIndex((c) => c.id === id)
    if (i >= 0) setViewerIndex(i)
  }

  // Einfachklick-Auswahl mit Modifiern (Reihenfolge = sortiertes Anzeige-Set):
  //  - Shift: Bereich von der Bezugskachel (anchor) bis hier; mit Strg additiv.
  //  - Strg/Cmd: einzelne Kachel hinzufügen/entfernen.
  //  - ohne Modifier: nur diese Kachel.
  const handleCardSelect = (id: string, e: React.MouseEvent) => {
    const additive = e.ctrlKey || e.metaKey
    if (e.shiftKey && anchorId) {
      const ids = visibleCases.map((c) => c.id)
      const a = ids.indexOf(anchorId)
      const b = ids.indexOf(id)
      if (a === -1 || b === -1) {
        setSelectedIds(new Set([id]))
        setAnchorId(id)
        return
      }
      const [lo, hi] = a < b ? [a, b] : [b, a]
      const range = ids.slice(lo, hi + 1)
      setSelectedIds((prev) => {
        const base = additive ? new Set(prev) : new Set<string>()
        for (const r of range) base.add(r)
        return base
      })
      // anchor bleibt bewusst stehen (weitere Shift-Klicks gehen von dort aus).
    } else if (additive) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setAnchorId(id)
    } else {
      setSelectedIds(new Set([id]))
      setAnchorId(id)
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setAnchorId(null)
  }

  // Drag-Start einer Kachel. Entscheidet anhand der Auswahl, welche Fälle gezogen
  // werden: einen AUSGEWÄHLTEN Fall ziehen → alle ausgewählten mitnehmen; einen
  // NICHT ausgewählten ziehen → nur diesen, und die Auswahl auf genau ihn setzen
  // (sonst würde eine unsichtbar bestehende Auswahl mit-getaggt — verwirrend).
  const handleCardDragStart = (id: string, e: React.DragEvent) => {
    let ids: string[]
    if (selectedIds.has(id)) {
      ids = Array.from(selectedIds)
    } else {
      ids = [id]
      setSelectedIds(new Set([id]))
      setAnchorId(id)
    }
    setCaseDragData(e, ids)
  }

  const handleSortChange = (key: SortKey, dir: SortDir) => {
    updateSettings({ sortKey: key, sortDir: dir })
  }

  // Platzhalter für noch nicht gebaute Werkzeuge (Diashow, Stichwort-Galerie).
  // Sobald die Funktionen existieren, ersetzen ihre Öffnen-Handler diese Toasts.
  const notifyComingSoon = (name: string) =>
    setToast({ text: `${name} ist noch nicht gebaut.`, id: Date.now() })

  // Diashow über das aktuell gefilterte Set starten — nur Fälle mit Bild. Das Set
  // wird beim Öffnen eingefroren, damit es während der Show stabil bleibt.
  const openSlideshow = () => {
    const withImage = visibleCases.filter((c) => c.image !== null)
    if (withImage.length === 0) {
      setToast({ text: 'Keine Bilder im aktuellen Set für die Diashow.', id: Date.now() })
      return
    }
    setSlideshowCases(withImage)
  }

  return (
    <div className="flex h-full flex-col">
      <Header />
      {!snapshot.settings.disclaimerAccepted && (
        <DisclaimerBanner onAccept={acceptDisclaimer} />
      )}
      <FileReconnectBanner
        status={fileStatus}
        fileName={fileName}
        fileError={fileError}
        onReconnect={() => void reconnectFile()}
      />
      <div className="flex min-h-0 flex-1">
        <ResizableSidebar width={sidebarWidth} onCommit={commitSidebarWidth}>
          <Sidebar
            cases={snapshot.cases}
            tagGroups={snapshot.tagGroups}
            activeFilter={filter}
            onFilterChange={setFilter}
            mutate={applyMutation}
            query={query}
            onQueryChange={setQuery}
            caseSensitive={snapshot.settings.searchCaseSensitive}
            onToggleCaseSensitive={() =>
              updateSettings({
                searchCaseSensitive: !snapshot.settings.searchCaseSensitive,
              })
            }
            onAddCase={() => setAddOpen(true)}
            onOpenImport={() => setImportOpen(true)}
            onOpenSlideshow={openSlideshow}
            onOpenGallery={() => notifyComingSoon('Stichwort-Galerie')}
            onFindDuplicates={() => setDuplicatesOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            theme={snapshot.settings.theme}
            onToggleTheme={toggleTheme}
            bottomHeight={sidebarBottomHeight}
            onCommitBottomHeight={(h) =>
              updateSettings({ sidebarBottomHeight: h })
            }
          />
        </ResizableSidebar>
        <CaseGrid
          cases={visibleCases}
          totalCases={snapshot.cases.length}
          tagGroups={snapshot.tagGroups}
          view={view}
          onViewChange={setView}
          sortKey={snapshot.settings.sortKey}
          sortDir={snapshot.settings.sortDir}
          onSortChange={handleSortChange}
          canUndo={canUndo}
          onUndo={runUndo}
          selectedIds={selectedIds}
          onCardSelect={handleCardSelect}
          onCardOpen={openViewer}
          onCardDragStart={handleCardDragStart}
          onClearSelection={clearSelection}
        />
      </div>

      {addOpen && (
        <CaseFormModal
          mode="case"
          tagGroups={snapshot.tagGroups}
          settings={snapshot.settings}
          onSubmit={handleCreate}
          onClose={() => setAddOpen(false)}
        />
      )}

      {viewerIndex !== null && visibleCases[viewerIndex] && (
        <Lightbox
          cases={visibleCases}
          index={viewerIndex}
          tagGroups={snapshot.tagGroups}
          notesDefaultOpen={snapshot.settings.notesExpandedByDefault}
          onIndexChange={setViewerIndex}
          onEdit={setEditCase}
          onDelete={deleteCase}
          onClose={() => setViewerIndex(null)}
        />
      )}

      {editCase && (
        <CaseFormModal
          mode={
            editCase.videoPath
              ? 'video'
              : editCase.image === null
                ? 'note'
                : 'case'
          }
          tagGroups={snapshot.tagGroups}
          settings={snapshot.settings}
          initial={editCase}
          onSubmit={(data) => updateCase(editCase.id, data)}
          onClose={() => setEditCase(null)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          snapshot={snapshot}
          tagGroups={snapshot.tagGroups}
          settings={snapshot.settings}
          updateSettings={updateSettings}
          applyMutation={applyMutation}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {importOpen && (
        <BatchImportModal
          tagGroups={snapshot.tagGroups}
          settings={snapshot.settings}
          onImport={handleBatchImport}
          onClose={() => setImportOpen(false)}
        />
      )}

      {duplicatesOpen && (
        <DuplicatesModal
          cases={snapshot.cases}
          tagGroups={snapshot.tagGroups}
          applyMutation={applyMutation}
          onClose={() => setDuplicatesOpen(false)}
        />
      )}

      {conflict && (
        <ConflictDialog conflict={conflict} onResolve={resolveConflict} />
      )}

      {slideshowCases && (
        <Slideshow
          cases={slideshowCases}
          tagGroups={snapshot.tagGroups}
          settings={snapshot.settings}
          updateSettings={updateSettings}
          onClose={() => setSlideshowCases(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2"
        >
          <div className="bg-surface-2 border-accent text-text rounded-[var(--radius-card)] border px-4 py-2 text-[13px] shadow-lg">
            {toast.text}
          </div>
        </div>
      )}
    </div>
  )
}

function CenterMessage({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode
  tone?: 'muted' | 'danger'
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <p className={tone === 'danger' ? 'text-danger text-sm' : 'text-text-muted text-sm'}>
        {children}
      </p>
    </div>
  )
}
