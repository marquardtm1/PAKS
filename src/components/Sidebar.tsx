import { useState } from 'react'
import type { Case, TagGroup } from '@/lib/types'
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
}: {
  cases: Case[]
  tagGroups: TagGroup[]
  activeFilter: ActiveFilter
  onFilterChange: (f: ActiveFilter) => void
  mutate: Mutate
}) {
  const counts = viewCounts(cases)
  const ordered = [...tagGroups].sort((a, b) => a.order - b.order)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <aside className="bg-surface border-border w-full overflow-y-auto border-r py-3">
      <div className="mb-2">
        <div className="text-text-muted px-4 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.1em] uppercase">
          Ansicht
        </div>
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
    </aside>
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
