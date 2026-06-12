import type { Case, TagGroup } from '@/lib/types'
import { caseChips } from '@/lib/tags'
import { TagChip } from './TagChip'

/**
 * Fall-Kachel. Zwei Varianten:
 *  - Bild-Fall: Bildvorschau oben (immer gleich positioniert), Titel + Chips +
 *    optionaler „Notiz vorhanden"-Hinweis darunter.
 *  - Reine Notiz: textorientiertes Layout in Notiz-Gold statt Bildplatzhalter.
 *
 * Interaktion (sauber getrennt):
 *  - Einfachklick → auswählen (Modifier Strg/Shift werden hochgereicht).
 *  - Doppelklick → Vollbild-Ansicht (Lightbox).
 *  - Drag & Drop → Kachel auf einen Sidebar-Wert ziehen, um den Fall zu taggen.
 * Ein Drag löst keinen Klick aus; Einfach-/Doppelklick kollidieren nicht.
 */
export function CaseCard({
  c,
  tagGroups,
  selected,
  onSelect,
  onOpen,
  onDragStart,
}: {
  c: Case
  tagGroups: TagGroup[]
  selected: boolean
  onSelect: (id: string, e: React.MouseEvent) => void
  onOpen: (id: string) => void
  onDragStart: (id: string, e: React.DragEvent) => void
}) {
  const chips = caseChips(c, tagGroups)
  const hasNote = c.notes.trim() !== ''

  const commonProps = {
    type: 'button' as const,
    'data-case-card': c.id,
    draggable: true,
    onDragStart: (e: React.DragEvent) => onDragStart(c.id, e),
    onClick: (e: React.MouseEvent) => onSelect(c.id, e),
    onDoubleClick: () => onOpen(c.id),
  }

  // Auswahl sichtbar: Akzent-Rahmen + Ring, hebt sich klar vom Hover ab.
  const selectionClass = selected
    ? 'border-accent ring-2 ring-accent'
    : 'hover:border-accent'

  if (c.image === null) {
    const noteText = c.notes.trim() || c.description.trim() || '(kein Text)'
    return (
      <button
        {...commonProps}
        className={`border-note-border bg-note-bg flex flex-col overflow-hidden rounded-[var(--radius-card)] border text-left transition-colors ${selectionClass}`}
      >
        <div className="border-note-border flex min-h-[90px] flex-1 items-start gap-2 border-b p-3">
          <span className="shrink-0 text-base opacity-70">📝</span>
          <span className="text-note line-clamp-4 text-xs leading-relaxed">
            {noteText}
          </span>
        </div>
        <CardBody title={c.title} chips={chips} />
      </button>
    )
  }

  return (
    <button
      {...commonProps}
      className={`border-border bg-surface flex flex-col overflow-hidden rounded-[var(--radius-card)] border text-left transition-colors ${selectionClass}`}
    >
      <img
        src={c.image}
        alt={c.title}
        draggable={false}
        className="block aspect-square w-full shrink-0 bg-black object-cover"
      />
      <CardBody title={c.title} chips={chips} hasNote={hasNote} />
    </button>
  )
}

function CardBody({
  title,
  chips,
  hasNote = false,
}: {
  title: string
  chips: ReturnType<typeof caseChips>
  hasNote?: boolean
}) {
  return (
    <div className="flex flex-1 flex-col p-2.5">
      <div className="mb-1 truncate text-[13px] font-semibold">
        {title || '(ohne Titel)'}
      </div>
      <div className="flex flex-wrap gap-1">
        {chips.map((chip, i) => (
          <TagChip key={i} chip={chip} />
        ))}
      </div>
      {hasNote && (
        <div className="mt-1 text-[10px] text-[#a89a30]">📝 Notiz vorhanden</div>
      )}
    </div>
  )
}
