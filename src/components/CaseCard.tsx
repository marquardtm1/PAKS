import type { Case, TagGroup } from '@/lib/types'
import { caseChips } from '@/lib/tags'
import { isVideoCase } from '@/lib/video'
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
 *  - Hover-Stift (Ecke) → Bearbeiten-Formular direkt öffnen (ohne Lightbox).
 *  - Hover-Mülleimer (darunter) → Fall löschen (mit Rückfrage, ohne Lightbox).
 * Ein Drag löst keinen Klick aus; Einfach-/Doppelklick kollidieren nicht; Stift
 * und Mülleimer kapseln ihre Klicks (stopPropagation) und lösen keine der
 * obigen aus.
 */
export function CaseCard({
  c,
  tagGroups,
  selected,
  onSelect,
  onOpen,
  onEdit,
  onDelete,
  onDragStart,
}: {
  c: Case
  tagGroups: TagGroup[]
  selected: boolean
  onSelect: (id: string, e: React.MouseEvent) => void
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onDragStart: (id: string, e: React.DragEvent) => void
}) {
  const chips = caseChips(c, tagGroups)
  const hasNote = c.notes.trim() !== ''
  const isVideo = isVideoCase(c)
  const hasAnnotations = (c.annotations?.length ?? 0) > 0

  const commonProps = {
    type: 'button' as const,
    'data-case-card': c.id,
    draggable: true,
    onDragStart: (e: React.DragEvent) => onDragStart(c.id, e),
    onClick: (e: React.MouseEvent) => onSelect(c.id, e),
    onDoubleClick: () => onOpen(c.id),
  }

  // Auswahl sichtbar: Akzent-Rahmen + Ring, hebt sich klar vom Hover ab.
  // `group` macht die ganze Kachel zum Hover-Ziel für den Stift.
  const selectionClass = selected
    ? 'border-accent ring-2 ring-accent'
    : 'hover:border-accent'

  if (c.image === null && !isVideo) {
    const noteText = c.notes.trim() || c.description.trim() || '(kein Text)'
    return (
      <button
        {...commonProps}
        className={`group border-note-border bg-note-bg relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border text-left transition-colors ${selectionClass}`}
      >
        <EditButton onEdit={() => onEdit(c.id)} />
        <DeleteButton onDelete={() => onDelete(c.id)} />
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
      className={`group border-border bg-surface relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border text-left transition-colors ${selectionClass}`}
    >
      <EditButton onEdit={() => onEdit(c.id)} />
      <DeleteButton onDelete={() => onDelete(c.id)} />
      <div className="relative aspect-square w-full shrink-0">
        {c.image ? (
          <img
            src={c.image}
            alt={c.title}
            draggable={false}
            className="block h-full w-full bg-black object-cover"
          />
        ) : (
          // Video-Fall ohne extrahiertes Thumbnail: Platzhalter statt Bild.
          <div className="flex h-full w-full items-center justify-center bg-black text-3xl">
            🎬
          </div>
        )}
        {isVideo && <PlayBadge />}
        {hasAnnotations && <AnnotationBadge />}
      </div>
      <CardBody title={c.title} chips={chips} hasNote={hasNote} />
    </button>
  )
}

/**
 * Hover-Bearbeiten-Stift in der oberen linken Ecke (links, um dem Annotations-
 * Badge oben rechts auszuweichen). Liegt als role=button-Span IM Kachel-Button
 * (kein verschachteltes <button>), kapselt aber alle Pointer-/Klick-Events, damit
 * weder Auswahl, Lightbox noch Drag mitausgelöst werden.
 *
 * Sichtbarkeit: auf Geräten mit Maus erst bei Kachel-Hover, sonst (Touch, kein
 * Hover) dauerhaft dezent — sonst wäre er per Finger nie erreichbar.
 */
function EditButton({ onEdit }: { onEdit: () => void }) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label="Fall bearbeiten"
      title="Bearbeiten"
      draggable={false}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onEdit()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      className="bg-bg/80 text-text-muted hover:text-text hover:border-accent border-border absolute top-1.5 left-1.5 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-[var(--radius-card)] border opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-70"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </span>
  )
}

/**
 * Hover-Löschen-Mülleimer, direkt unter dem Bearbeiten-Stift (gleiche linke
 * Ecke). Identische Kollisionsvermeidung wie EditButton: role=button-Span IM
 * Kachel-Button, kapselt alle Pointer-/Klick-Events (stopPropagation +
 * draggable=false) → kein Auswählen, keine Lightbox, kein Drag.
 *
 * Sicherheits-Rückfrage vor dem Löschen, damit nichts versehentlich verschwindet
 * (zusammen mit Undo/Redo ist ein Papierkorb nicht nötig).
 */
function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label="Fall löschen"
      title="Löschen"
      draggable={false}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        if (window.confirm('Fall wirklich löschen?')) onDelete()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      className="bg-bg/80 text-text-muted hover:text-danger hover:border-danger border-border absolute top-9 left-1.5 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-[var(--radius-card)] border opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-70"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    </span>
  )
}

/** Dezentes Markierungs-Symbol (oben rechts) — signalisiert „hat Annotationen",
 *  ohne die Annotationen selbst aufs kleine Thumbnail zu zeichnen. */
function AnnotationBadge() {
  return (
    <span
      className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/70"
      title="Hat Markierungen"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </span>
  )
}

/** Play-Symbol über dem Thumbnail — macht Video-Fälle auf einen Blick erkennbar. */
function PlayBadge() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/70">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <polygon points="8 5 19 12 8 19 8 5" />
        </svg>
      </span>
    </span>
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
