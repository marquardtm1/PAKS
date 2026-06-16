import type { Case, SortDir, SortKey, TagGroup } from '@/lib/types'
import { CaseCard } from './CaseCard'

export type ViewMode = 'grid' | 'list'

/**
 * Hauptfeld: Toolbar (Trefferzahl + Sortierung + Ansichts-Umschalter) und das
 * Kachelgrid. Im Listen-Modus wird das Grid einspaltig.
 *
 * Auswahl: Einfachklick auf eine Kachel wählt aus (Strg/Shift für Mehrfach-/
 * Bereichsauswahl, in AppShell ausgewertet), Klick in den leeren Bereich hebt
 * die Auswahl auf, Doppelklick öffnet die Vollbild-Ansicht.
 */
export function CaseGrid({
  cases,
  totalCases,
  tagGroups,
  view,
  onViewChange,
  sortKey,
  sortDir,
  onSortChange,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  selectedIds,
  onCardSelect,
  onCardOpen,
  onCardEdit,
  onCardDelete,
  onCardDragStart,
  onClearSelection,
}: {
  cases: Case[]
  totalCases: number
  tagGroups: TagGroup[]
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  sortKey: SortKey
  sortDir: SortDir
  onSortChange: (key: SortKey, dir: SortDir) => void
  canUndo: boolean
  onUndo: () => void
  canRedo: boolean
  onRedo: () => void
  selectedIds: Set<string>
  onCardSelect: (id: string, e: React.MouseEvent) => void
  onCardOpen: (id: string) => void
  onCardEdit: (id: string) => void
  onCardDelete: (id: string) => void
  onCardDragStart: (id: string, e: React.DragEvent) => void
  onClearSelection: () => void
}) {
  // Klick in den leeren Bereich (nicht auf Kachel oder Toolbar) hebt die Auswahl auf.
  function handleBackgroundClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('[data-case-card]') || target.closest('[data-toolbar]')) return
    onClearSelection()
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-4" onClick={handleBackgroundClick}>
      {/* Sticky Werkzeugleiste: bleibt beim Scrollen oben stehen. -mx-5 px-5
          lässt den deckenden Hintergrund (bg-bg) + Trennlinie die volle Breite
          füllen, damit durchscrollende Kacheln nicht durchscheinen; py-3 gibt der
          Leiste eigenen Abstand, mb-3 hält die Kacheln darunter frei. */}
      <div
        className="bg-bg border-border sticky top-0 z-10 -mx-5 mb-3 flex items-center gap-2.5 border-b px-5 py-3"
        data-toolbar
      >
        <span className="text-text-muted text-[13px]">
          {cases.length} {cases.length === 1 ? 'Fall' : 'Fälle'}
          {selectedIds.size > 0 && (
            <span className="text-accent"> · {selectedIds.size} ausgewählt</span>
          )}
        </span>
        <div className="flex-1" />

        {/* Rückgängig (Strg+Z) — inaktiv, wenn der Verlauf leer ist */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo ? 'Rückgängig (Strg+Z)' : 'Nichts rückgängig zu machen'}
          className="bg-surface-2 border-border text-text hover:border-accent inline-flex items-center gap-1.5 rounded-[var(--radius-card)] border px-2.5 py-1 text-[12px] transition-colors disabled:cursor-default disabled:opacity-40 disabled:hover:border-[color:var(--color-border)]"
        >
          <UndoIcon /> Rückgängig
        </button>

        {/* Wiederherstellen (Strg+Y / Strg+Shift+Z) — inaktiv ohne Redo-Verlauf */}
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title={
            canRedo
              ? 'Wiederherstellen (Strg+Y)'
              : 'Nichts wiederherzustellen'
          }
          className="bg-surface-2 border-border text-text hover:border-accent inline-flex items-center gap-1.5 rounded-[var(--radius-card)] border px-2.5 py-1 text-[12px] transition-colors disabled:cursor-default disabled:opacity-40 disabled:hover:border-[color:var(--color-border)]"
        >
          <RedoIcon /> Wiederherstellen
        </button>

        <div className="mx-1 h-5 w-px bg-[color:var(--color-border)]" />

        {/* Sortierung: Schlüssel (Titel/Datum) + Richtung */}
        <span className="text-text-muted text-xs">Sortieren</span>
        <div className="flex">
          <SegButton
            active={sortKey === 'title'}
            onClick={() => onSortChange('title', sortDir)}
            rounded="left"
          >
            Titel
          </SegButton>
          <SegButton
            active={sortKey === 'date'}
            onClick={() => onSortChange('date', sortDir)}
            rounded="right"
          >
            Datum
          </SegButton>
        </div>
        <button
          type="button"
          onClick={() => onSortChange(sortKey, sortDir === 'asc' ? 'desc' : 'asc')}
          title={sortDir === 'asc' ? 'Aufsteigend' : 'Absteigend'}
          aria-label="Sortierrichtung umschalten"
          className="bg-surface-2 border-border text-text-muted hover:text-text hover:border-accent inline-flex h-[28px] w-[28px] items-center justify-center rounded-[var(--radius-card)] border text-sm transition-colors"
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>

        <div className="mx-1 h-5 w-px bg-[color:var(--color-border)]" />

        <div className="flex">
          <ViewButton
            active={view === 'grid'}
            onClick={() => onViewChange('grid')}
            title="Kacheln"
            rounded="left"
          >
            <GridIcon />
          </ViewButton>
          <ViewButton
            active={view === 'list'}
            onClick={() => onViewChange('list')}
            title="Liste"
            rounded="right"
          >
            <ListIcon />
          </ViewButton>
        </div>
      </div>

      {cases.length === 0 ? (
        <EmptyState hasAnyCases={totalCases > 0} />
      ) : (
        <div
          className="grid items-stretch gap-3"
          style={{
            gridTemplateColumns:
              view === 'list'
                ? '1fr'
                : 'repeat(auto-fill, minmax(200px, 1fr))',
          }}
        >
          {cases.map((c) => (
            <CaseCard
              key={c.id}
              c={c}
              tagGroups={tagGroups}
              selected={selectedIds.has(c.id)}
              list={view === 'list'}
              onSelect={onCardSelect}
              onOpen={onCardOpen}
              onEdit={onCardEdit}
              onDelete={onCardDelete}
              onDragStart={onCardDragStart}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ hasAnyCases }: { hasAnyCases: boolean }) {
  return (
    <div className="text-text-muted py-16 text-center">
      <div className="mb-3 text-5xl opacity-40">🩻</div>
      <h3 className="text-text mb-1.5 text-base">
        {hasAnyCases ? 'Keine Treffer' : 'Noch keine Fälle'}
      </h3>
      <p className="text-sm">
        {hasAnyCases
          ? 'Suchbegriff oder Filter anpassen.'
          : 'Lege deinen ersten Fall an, um zu starten.'}
      </p>
    </div>
  )
}

function SegButton({
  active,
  onClick,
  rounded,
  children,
}: {
  active: boolean
  onClick: () => void
  rounded: 'left' | 'right'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'border-border border px-2.5 py-1 text-[12px] transition-colors',
        rounded === 'left' ? 'rounded-l-[var(--radius-card)]' : 'rounded-r-[var(--radius-card)] border-l-0',
        active
          ? 'bg-accent border-accent text-white'
          : 'bg-surface-2 text-text-muted hover:text-text',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function ViewButton({
  active,
  onClick,
  title,
  rounded,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  rounded: 'left' | 'right'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={[
        'border-border border p-1.5 transition-colors',
        rounded === 'left' ? 'rounded-l-[var(--radius-card)]' : 'rounded-r-[var(--radius-card)] border-l-0',
        active
          ? 'bg-accent border-accent text-white'
          : 'bg-surface-2 text-text-muted hover:text-text',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function UndoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
    </svg>
  )
}

function RedoIcon() {
  // Spiegelbild des UndoIcon (Pfeil nach rechts statt links).
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h1" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}
