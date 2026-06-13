import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Case, TagGroup, Theme } from '@/lib/types'
import type { Snapshot } from '@/lib/persistence/format'
import {
  filterEquals,
  groupValueCounts,
  viewCounts,
  type ActiveFilter,
} from '@/lib/filter'
import {
  addGroup,
  addValue,
  assignValueToCases,
  renameGroup,
  renameValue,
} from '@/lib/tagGroupOps'
import { confirmDeleteGroup, confirmDeleteValue } from '@/lib/tagGroupActions'
import { getCaseDragIds, isCaseDrag } from '@/lib/dnd'
import { EditableText } from './EditableText'

type Mutate = (
  fn: (s: Snapshot) => Snapshot,
  opts?: { recordUndo?: boolean; label?: string },
) => void

/** Mindesthöhe der unteren Befehlszone in px (darunter scrollt sie intern). */
const MIN_BOTTOM_HEIGHT = 72

/**
 * Linke Seitenleiste: feste Ansichts-Filter oben, darunter je eine aufklappbare
 * Sektion pro Tag-Gruppe (in priorisierter Reihenfolge) mit Werten + Counts.
 *
 * Gruppen und Werte sind direkt hier bearbeitbar: Umbenennen-/Löschen-Symbole
 * erscheinen nur beim Hovern über der jeweiligen Zeile, damit die Sidebar im
 * Normalzustand ruhig bleibt und der Klick weiterhin filtert. Bearbeiten nutzt
 * dieselben Mutationen wie das Zahnrad-Modal (tagGroupOps / tagGroupActions) —
 * Farbe, Priorität, Pflichtfeld und Neuanlage bleiben dem Zahnrad vorbehalten.
 */
export function Sidebar({
  cases,
  tagGroups,
  activeFilter,
  onFilterChange,
  mutate,
  query,
  onQueryChange,
  caseSensitive,
  onToggleCaseSensitive,
  onAddCase,
  onAddNote,
  onOpenImport,
  onOpenSlideshow,
  onOpenGallery,
  onOpenSettings,
  theme,
  onToggleTheme,
  bottomHeight,
  onCommitBottomHeight,
}: {
  cases: Case[]
  tagGroups: TagGroup[]
  activeFilter: ActiveFilter
  onFilterChange: (f: ActiveFilter) => void
  mutate: Mutate
  query: string
  onQueryChange: (q: string) => void
  caseSensitive: boolean
  onToggleCaseSensitive: () => void
  onAddCase: () => void
  onAddNote: () => void
  onOpenImport: () => void
  onOpenSlideshow: () => void
  onOpenGallery: () => void
  onOpenSettings: () => void
  theme: Theme
  onToggleTheme: () => void
  bottomHeight: number
  onCommitBottomHeight: (h: number) => void
}) {
  const counts = viewCounts(cases)
  const ordered = [...tagGroups].sort((a, b) => a.order - b.order)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Verstellbare Trennlinie zwischen Kategorien (Zone 2) und Befehlszone (Zone 3).
  // Wie bei der Breiten-Anpassung wird während des Drags die Höhe direkt am DOM
  // gesetzt (kein Re-Render), erst beim Loslassen via onCommitBottomHeight
  // persistiert. asideRef begrenzt die Höhe relativ zur Sidebar-Gesamthöhe.
  const asideRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startHeight: number
  } | null>(null)

  const clampBottom = (h: number) => {
    const total = asideRef.current?.getBoundingClientRect().height ?? 600
    // Suche + ein Rest Kategorien + Mini-Leiste sollen sichtbar bleiben.
    const max = Math.max(MIN_BOTTOM_HEIGHT, total - 220)
    return Math.max(MIN_BOTTOM_HEIGHT, Math.min(max, h))
  }

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!bottomRef.current) return
    e.preventDefault()
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight: bottomRef.current.getBoundingClientRect().height,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'
  }

  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId || !bottomRef.current) return
    // Nach oben ziehen (kleineres clientY) → Befehlszone höher.
    const next = clampBottom(drag.startHeight + (drag.startY - e.clientY))
    bottomRef.current.style.height = `${next}px`
  }

  const onHandleUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Pointer-Capture kann bereits verloren sein.
    }
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    if (bottomRef.current) {
      onCommitBottomHeight(
        clampBottom(bottomRef.current.getBoundingClientRect().height),
      )
    }
    dragRef.current = null
  }

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <aside
      ref={asideRef}
      className="bg-surface border-border flex h-full w-full flex-col border-r"
    >
      {/* ── Zone 1: Suche (fix oben) ──────────────────────────────────────────
          Suchfeld + Aa nebeneinander; per flex-wrap rutscht das Aa bei sehr
          schmaler Sidebar automatisch in die Zeile darunter. */}
      <div className="border-border shrink-0 border-b px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[140px] flex-1">
            <svg
              className="text-text-muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                // Esc leert das Suchfeld (und setzt die Ergebnisliste zurück).
                if (e.key === 'Escape' && query) {
                  e.preventDefault()
                  onQueryChange('')
                }
              }}
              placeholder="Suche …"
              aria-label="Fälle durchsuchen"
              autoComplete="off"
              spellCheck={false}
              className={[
                'bg-bg border-border text-text focus:border-accent h-[30px] w-full rounded-[var(--radius-card)] border pl-8 text-[13px] outline-none transition-colors',
                query ? 'pr-8' : 'pr-3',
              ].join(' ')}
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                aria-label="Suche leeren"
                title="Suche leeren (Esc)"
                className="text-text-muted hover:text-text absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-base leading-none transition-colors"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onToggleCaseSensitive}
            aria-pressed={caseSensitive}
            title={
              caseSensitive
                ? 'Groß-/Kleinschreibung beachten: an'
                : 'Groß-/Kleinschreibung beachten: aus'
            }
            aria-label="Groß-/Kleinschreibung in der Suche umschalten"
            className={[
              'inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-card)] border text-[13px] font-semibold transition-colors',
              caseSensitive
                ? 'bg-accent border-accent text-white'
                : 'bg-surface-2 border-border text-text-muted hover:text-text hover:border-accent',
            ].join(' ')}
          >
            Aa
          </button>
        </div>
      </div>

      {/* ── Zone 2: Ansicht + Kategorien (scrollender Bereich) ────────────────
          Einziger Teil, der beliebig lang werden darf und dann scrollt; die
          festen Befehlszonen oben/unten bleiben dabei stehen. */}
      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        <div className="mb-2">
          <ZoneLabel>Ansicht</ZoneLabel>
          <FilterRow
            label="Alle Fälle"
            count={counts.all}
            active={activeFilter.kind === 'all'}
            onClick={() => onFilterChange({ kind: 'all' })}
          />
          <FilterRow
            label="Reine Notizen"
            count={counts.noteOnly}
            active={activeFilter.kind === 'noteonly'}
            onClick={() => onFilterChange({ kind: 'noteonly' })}
          />
          <FilterRow
            label="Mit Notizen"
            count={counts.withNotes}
            active={activeFilter.kind === 'notes'}
            onClick={() => onFilterChange({ kind: 'notes' })}
          />
        </div>

        {ordered.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            cases={cases}
            collapsed={collapsed.has(group.id)}
            onToggle={() => toggle(group.id)}
            activeFilter={activeFilter}
            onFilterChange={onFilterChange}
            mutate={mutate}
          />
        ))}

        <div className="group/add">
          <InlineAdd
            onAdd={(v) => mutate((s) => addGroup(s, v))}
            label="+ Gruppe"
            placeholder="Gruppenname"
            rowClassName="px-4 py-1.5"
            triggerClassName="text-text-muted hover:text-text w-full text-left text-[10px] font-semibold tracking-[0.1em] uppercase opacity-0 transition-opacity group-hover/add:opacity-100"
            inputClassName="bg-bg border-accent text-text w-2/3 rounded-[3px] border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase outline-none"
          />
        </div>
      </div>

      {/* ── Trennlinie (verstellbar): zieht die Grenze zwischen Kategorien und
          Befehlszone. Hoch = mehr Befehlszone, runter = mehr Kategorien. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Höhe der Befehlszone anpassen"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        style={{ touchAction: 'none' }}
        className="group border-border relative h-1.5 shrink-0 cursor-row-resize border-t"
      >
        <span
          aria-hidden="true"
          className="group-hover:bg-accent group-active:bg-accent pointer-events-none absolute inset-x-0 top-0 h-px -translate-y-px bg-transparent transition-colors"
        />
      </div>

      {/* ── Zone 3: Befehle (feste, per Trennlinie verstellbare Höhe) ─────────
          Scrollt intern, falls die Höhe knapp wird. */}
      <div
        ref={bottomRef}
        style={{ height: bottomHeight }}
        className="shrink-0 overflow-y-auto"
      >
        <div className="py-2">
          <ZoneLabel>Hinzufügen</ZoneLabel>
          <SidebarActionRow icon={<PlusIcon />} label="Fall hinzufügen" primary onClick={onAddCase} />
          <SidebarActionRow icon={<NoteIcon />} label="Notiz" onClick={onAddNote} />
          <SidebarActionRow icon={<ImportIcon />} label="Import" onClick={onOpenImport} />
        </div>

        <div className="border-border border-t py-2">
          <ZoneLabel>Werkzeuge</ZoneLabel>
          <SidebarActionRow icon={<PlayIcon />} label="Diashow" onClick={onOpenSlideshow} />
          <SidebarActionRow
            icon={<GalleryIcon />}
            label="Stichwort-Galerie"
            onClick={onOpenGallery}
          />
        </div>
      </div>

      {/* ── Einstellungs-Mini-Leiste (immer ganz unten fix, von der Trennlinie
          unberührt): Zahnrad + Tag/Nacht direkt nebeneinander. */}
      <div className="border-border shrink-0 border-t px-3 py-2">
        <div className="flex items-center gap-1.5">
          <MiniBarButton
            label="Einstellungen"
            title="Einstellungen (Tag-Gruppen, Backup, Darstellung)"
            onClick={onOpenSettings}
          >
            <GearIcon />
          </MiniBarButton>
          <MiniBarButton
            label="Farbschema umschalten"
            title={theme === 'dark' ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln'}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </MiniBarButton>
        </div>
      </div>
    </aside>
  )
}

/** Icon-Knopf der unteren Mini-Leiste (Einstellungen / Theme). */
function MiniBarButton({
  label,
  title,
  onClick,
  children,
}: {
  label: string
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className="bg-surface-2 border-border text-text-muted hover:text-text hover:border-accent inline-flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-card)] border transition-colors"
    >
      {children}
    </button>
  )
}

/** Zonen-Überschrift in der Sidebar (10px, gesperrt, uppercase) — geteilt von
 *  „Ansicht", „Hinzufügen" und „Werkzeuge". */
function ZoneLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-text-muted px-4 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.1em] uppercase">
      {children}
    </div>
  )
}

/**
 * Ruhige Befehlszeile (Icon + Label, volle Breite) für die festen Zonen
 * „Hinzufügen" und „Werkzeuge". Genau eine Zeile darf `primary` sein (Akzent) —
 * „Fall hinzufügen". onClick wird erst in Schritt 3 verdrahtet.
 */
function SidebarActionRow({
  icon,
  label,
  primary = false,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode
  label: string
  primary?: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={[
        'flex w-full items-center gap-2.5 px-4 py-1.5 text-left text-[13px] transition-colors disabled:opacity-40',
        primary ? 'text-accent font-medium hover:bg-surface-2' : 'text-text hover:bg-surface-2',
      ].join(' ')}
    >
      <span className="text-text-muted shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

function GroupSection({
  group,
  cases,
  collapsed,
  onToggle,
  activeFilter,
  onFilterChange,
  mutate,
}: {
  group: TagGroup
  cases: Case[]
  collapsed: boolean
  onToggle: () => void
  activeFilter: ActiveFilter
  onFilterChange: (f: ActiveFilter) => void
  mutate: Mutate
}) {
  const [editing, setEditing] = useState(false)
  const valueCounts = groupValueCounts(cases, group.id)
  // Alle definierten Werte zeigen (auch ungenutzte, count 0). Nötig, damit neu
  // angelegte Werte sofort erscheinen UND damit ein noch ungenutzter Wert als
  // Drop-Ziel fürs Taggen (erste Zuordnung) verfügbar ist.
  const values = group.values

  return (
    <div className="group/grp mb-2">
      <div className="group/hd hover:bg-surface-2 flex items-center px-4 pt-1 pb-1.5">
        {editing ? (
          <EditableText
            value={group.name}
            autoFocus
            onCommit={(v) => mutate((s) => renameGroup(s, group.id, v))}
            onExit={() => setEditing(false)}
            className="bg-bg border-accent text-text w-2/3 rounded-[3px] border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase outline-none"
          />
        ) : (
          <>
            <button
              type="button"
              onClick={onToggle}
              className="text-text-muted flex flex-1 items-center gap-1.5 text-left text-[10px] font-semibold tracking-[0.1em] uppercase"
            >
              <span
                className="inline-block transition-transform"
                style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}
              >
                ▾
              </span>
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: group.colorHex }}
              />
              <span className="truncate">{group.name}</span>
            </button>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/hd:opacity-100">
              <IconButton label="Gruppe umbenennen" onClick={() => setEditing(true)}>
                <PencilIcon />
              </IconButton>
              <IconButton
                label="Gruppe löschen"
                danger
                onClick={() => confirmDeleteGroup(mutate, group.id, group.name)}
              >
                <TrashIcon />
              </IconButton>
            </div>
          </>
        )}
      </div>

      {!collapsed && (
        <>
          {values.length === 0 && (
            <div className="text-text-muted px-4 py-1 text-xs italic opacity-60">
              noch keine
            </div>
          )}
          {values.map((value) => (
            <ValueRow
              key={value}
              label={value}
              count={valueCounts.get(value) ?? 0}
              color={group.colorHex}
              active={filterEquals(activeFilter, {
                kind: 'group',
                groupId: group.id,
                value,
              })}
              onClick={() =>
                onFilterChange({ kind: 'group', groupId: group.id, value })
              }
              onRename={(v) => mutate((s) => renameValue(s, group.id, value, v))}
              onDelete={() => confirmDeleteValue(mutate, group.id, value)}
              onAssign={(caseIds) =>
                mutate((s) => assignValueToCases(s, caseIds, group.id, value), {
                  label:
                    caseIds.length === 1
                      ? 'Tag hinzugefügt'
                      : `Tag hinzugefügt zu ${caseIds.length} Fällen`,
                })
              }
            />
          ))}
          <InlineAdd
            compact
            onAdd={(v) => mutate((s) => addValue(s, group.id, v))}
            label="Wert hinzufügen"
            placeholder="Wert hinzufügen"
            inputClassName="bg-bg border-accent text-text w-2/3 rounded-[3px] border px-1.5 py-0.5 text-[13px] outline-none"
          />
        </>
      )}
    </div>
  )
}

function ValueRow({
  label,
  count,
  color,
  active,
  onClick,
  onRename,
  onDelete,
  onAssign,
}: {
  label: string
  count: number
  color: string
  active: boolean
  onClick: () => void
  onRename: (next: string) => void
  onDelete: () => void
  onAssign: (caseIds: string[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [dropActive, setDropActive] = useState(false)

  if (editing) {
    return (
      <div className="px-4 py-1.5">
        <EditableText
          value={label}
          autoFocus
          onCommit={onRename}
          onExit={() => setEditing(false)}
          className="bg-bg border-accent text-text w-2/3 rounded-[3px] border px-1.5 py-0.5 text-[13px] outline-none"
        />
      </div>
    )
  }

  return (
    <div
      className={[
        'group/val relative flex items-center transition-colors',
        dropActive
          ? 'bg-accent/20 ring-accent ring-1 ring-inset'
          : 'hover:bg-surface-2',
      ].join(' ')}
      onDragOver={(e) => {
        // Nur PAKS-Kachel-Drags annehmen; preventDefault erlaubt das Ablegen.
        if (!isCaseDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDropActive(true)
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        if (!isCaseDrag(e)) return
        e.preventDefault()
        setDropActive(false)
        const caseIds = getCaseDragIds(e)
        if (caseIds.length) onAssign(caseIds)
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className={[
          'flex w-full items-center justify-between px-4 py-1.5 text-left text-[13px] transition-colors',
          active ? 'text-accent' : 'text-text',
        ].join(' ')}
        style={active && !dropActive ? { background: 'var(--color-surface-2)' } : undefined}
      >
        <span
          className={[
            'truncate',
            count === 0 && !active ? 'text-text-muted' : '',
          ].join(' ')}
          style={active ? { color } : undefined}
        >
          {label}
        </span>
        <span
          className={[
            'text-text-muted bg-tag-bg ml-2 shrink-0 rounded-[10px] px-1.5 py-px text-[11px] transition-opacity group-hover/val:opacity-0',
            count === 0 ? 'opacity-40' : '',
          ].join(' ')}
        >
          {count}
        </span>
      </button>
      <div className="absolute right-2 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/val:opacity-100">
        <IconButton label={`Wert „${label}" umbenennen`} onClick={() => setEditing(true)}>
          <PencilIcon />
        </IconButton>
        <IconButton label={`Wert „${label}" löschen`} danger onClick={onDelete}>
          <TrashIcon />
        </IconButton>
      </div>
    </div>
  )
}

/** Kompaktes Sidebar-Filter-Element ohne Bearbeitung (für die feste Ansicht). */
function FilterRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center justify-between px-4 py-1.5 text-left text-[13px] transition-colors',
        active ? 'text-accent bg-surface-2' : 'text-text hover:bg-surface-2',
      ].join(' ')}
    >
      <span className="truncate">{label}</span>
      <span className="text-text-muted bg-tag-bg ml-2 shrink-0 rounded-[10px] px-1.5 py-px text-[11px]">
        {count}
      </span>
    </button>
  )
}

/**
 * Inline-Neuanlage per Hover-„+": idle zeigt nur bei Hover ein „+", Klick öffnet
 * ein schmales Eingabefeld. Commit ruft onAdd (addValue bzw. addGroup); leer
 * legt nichts an. Geteilt für Werte- und Gruppen-Ebene.
 *
 * compact (Werte-Ebene): idle ist nur eine dünne Linie mit zentriertem „+",
 * sichtbar beim Hovern der Gruppe — keine zusätzliche Zeilenhöhe im Ruhezustand.
 * Sonst (Gruppen-Ebene): volle Textzeile.
 */
function InlineAdd({
  onAdd,
  label,
  placeholder,
  inputClassName,
  compact = false,
  rowClassName,
  triggerClassName,
}: {
  onAdd: (value: string) => void
  label: string
  placeholder: string
  inputClassName: string
  compact?: boolean
  rowClassName?: string
  triggerClassName?: string
}) {
  const [adding, setAdding] = useState(false)

  if (adding) {
    return (
      <div className={compact ? 'px-4 py-1' : rowClassName}>
        <EditableText
          value=""
          autoFocus
          placeholder={placeholder}
          onCommit={onAdd}
          onExit={() => setAdding(false)}
          className={inputClassName}
        />
      </div>
    )
  }

  if (compact) {
    // Dünne Linie (8px), „+" und Linie nur beim Gruppen-Hover sichtbar.
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        aria-label={label}
        className="relative block h-2 w-full"
      >
        <span className="bg-border pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 opacity-0 transition-opacity group-hover/grp:opacity-100" />
        <span className="bg-surface text-accent pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-1 text-[11px] leading-none opacity-0 transition-opacity group-hover/grp:opacity-100">
          +
        </span>
      </button>
    )
  }

  return (
    <div className={rowClassName}>
      <button type="button" onClick={() => setAdding(true)} className={triggerClassName}>
        {label}
      </button>
    </div>
  )
}

/** Kleines Hover-Aktionssymbol. stopPropagation, damit der Filter-Klick ungestört bleibt. */
function IconButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={[
        'text-text-muted flex h-5 w-5 items-center justify-center rounded transition-colors',
        danger ? 'hover:text-danger' : 'hover:text-text',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  )
}

// Befehlszonen-Icons (14px). Spiegeln vorerst die Header-Icons; in Schritt 3/4
// wandern die Aktionen ganz aus dem Header hierher.
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  )
}

function ImportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function GalleryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )
}
