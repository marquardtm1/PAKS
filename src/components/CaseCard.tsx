import { useLayoutEffect, useRef, useState } from 'react'
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
  list,
  onSelect,
  onOpen,
  onEdit,
  onDelete,
  onDragStart,
}: {
  c: Case
  tagGroups: TagGroup[]
  selected: boolean
  /** Listen-Modus: horizontale Zeile mit festem Thumbnail (konstante Höhe). */
  list: boolean
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
  const isNote = c.image === null && !isVideo

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

  // Listen-Modus: horizontale Zeile mit festem 96px-Thumbnail links. Dadurch ist
  // die Zeilenhöhe konstant — unabhängig vom Seitenverhältnis des Bildes (hohe
  // Bilder werden im quadratischen Rahmen via object-cover zugeschnitten, statt
  // die Zeile in die Höhe zu ziehen, wie es ein vollbreites Quadrat täte).
  if (list) {
    const noteText = c.notes.trim() || c.description.trim() || '(kein Text)'
    return (
      <button
        {...commonProps}
        className={`group relative flex items-stretch overflow-hidden rounded-[var(--radius-card)] border text-left transition-colors ${
          isNote ? 'border-note-border bg-note-bg' : 'border-border bg-surface'
        } ${selectionClass}`}
      >
        <EditButton onEdit={() => onEdit(c.id)} />
        <DeleteButton onDelete={() => onDelete(c.id)} />
        <div className="relative h-24 w-24 shrink-0">
          {isNote ? (
            <div className="bg-note-bg flex h-full w-full items-center justify-center text-2xl opacity-70">
              📝
            </div>
          ) : c.image ? (
            <img
              src={c.image}
              alt={c.title}
              draggable={false}
              className="block h-full w-full bg-black object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black text-2xl">
              🎬
            </div>
          )}
          {isVideo && <PlayBadge />}
          {hasAnnotations && <AnnotationBadge />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
          <div className="truncate text-[13px] font-semibold">
            {c.title || '(ohne Titel)'}
          </div>
          {isNote && (
            <div className="text-note line-clamp-2 text-xs leading-relaxed">
              {noteText}
            </div>
          )}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {chips.map((chip, i) => (
                <TagChip key={i} chip={chip} />
              ))}
            </div>
          )}
          {!isNote && hasNote && (
            <div className="text-[10px] text-[#a89a30]">📝 Notiz vorhanden</div>
          )}
        </div>
      </button>
    )
  }

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
      {/* aspect-square hält die Kachel quadratisch. WICHTIG: Bild/Platzhalter
          liegen absolut (inset-0), damit ihre intrinsische Pixelhöhe NICHT in die
          Grid-Zeilenhöhe einfließt — sonst würde ein hohes Hochformat-Bild den
          auto-Row-Track aufblähen und aspect-square aushebeln (die Kachel wüchse
          mit dem Seitenverhältnis). So bestimmt allein der Rahmen die Höhe. */}
      <div className="relative aspect-square w-full shrink-0">
        {c.image ? (
          <img
            src={c.image}
            alt={c.title}
            draggable={false}
            className="absolute inset-0 block h-full w-full bg-black object-cover"
          />
        ) : (
          // Video-Fall ohne extrahiertes Thumbnail: Platzhalter statt Bild.
          <div className="absolute inset-0 flex items-center justify-center bg-black text-3xl">
            🎬
          </div>
        )}
        {isVideo && <PlayBadge />}
        {hasAnnotations && <AnnotationBadge />}
        {hasNote && <NoteBadge />}
      </div>
      <CardBody title={c.title} chips={chips} />
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

/** Dezentes Notiz-Symbol (unten links) — signalisiert „hat Notizen", ohne eine
 *  variable Textzeile in den Body zu setzen (die die Kachelhöhe ändern würde). */
function NoteBadge() {
  return (
    <span
      className="absolute bottom-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-[11px] ring-1 ring-white/70"
      title="Hat Notizen"
    >
      📝
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
}: {
  title: string
  chips: ReturnType<typeof caseChips>
}) {
  // Bewusst KEIN flex-1: Titel (eine Zeile, truncate) + feste Tag-Zone ergeben
  // eine konstante Body-Höhe → alle Grid-Kacheln gleich hoch.
  return (
    <div className="flex flex-col p-2.5">
      <div className="mb-1 truncate text-[13px] font-semibold">
        {title || '(ohne Titel)'}
      </div>
      <CardTags chips={chips} />
    </div>
  )
}

// gap-1 = 4px; reservierte Breite für den „+N"-Indikator (großzügig → eher ein
// Chip weniger als ein abgeschnittenes „+N").
const TAG_GAP = 4
const BADGE_RESERVE = 30

/**
 * Feste, EINZEILIGE Tag-Zone der Grid-Kachel. Konstante Höhe unabhängig von
 * Anzahl/Länge der Tags: es werden nur so viele Chips gezeigt, wie in eine Zeile
 * passen, der Rest wird zu einem dezenten „+N" zusammengefasst. Lange Tags werden
 * per Ellipsis gekürzt (TagChip truncate). Die vollständigen Tags bleiben in
 * Detail/Lightbox/Bearbeiten sichtbar — hier zählt nur der schnelle Überblick.
 *
 * Messung: ein versteckter Messer rendert ALLE Chips (mit identischem Styling,
 * inkl. Ellipsis-Kappung) und beeinflusst die Höhe nicht (absolut). Aus den
 * gemessenen Breiten wird berechnet, wie viele Chips plus „+N" in die verfügbare
 * Breite passen. ResizeObserver hält das bei Spaltenbreiten-Änderung aktuell.
 */
function CardTags({ chips }: { chips: ReturnType<typeof caseChips> }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(chips.length)

  useLayoutEffect(() => {
    const row = rowRef.current
    const meas = measureRef.current
    if (!row || !meas) return
    const compute = () => {
      const avail = row.clientWidth
      const widths = Array.from(meas.children).map(
        (el) => (el as HTMLElement).getBoundingClientRect().width,
      )
      let sum = 0
      widths.forEach((w, i) => {
        sum += w + (i > 0 ? TAG_GAP : 0)
      })
      // Passen alle → keine Kürzung, kein „+N".
      if (sum <= avail) {
        setVisible(chips.length)
        return
      }
      // Sonst so viele, wie samt reserviertem „+N" hineinpassen.
      let used = 0
      let count = 0
      for (let i = 0; i < widths.length; i++) {
        const add = (count > 0 ? TAG_GAP : 0) + widths[i]
        if (used + add + TAG_GAP + BADGE_RESERVE <= avail) {
          used += add
          count++
        } else break
      }
      setVisible(count)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    return () => ro.disconnect()
  }, [chips])

  // Leere, aber höhengleiche Zone, wenn es keine Tags gibt (Höhe bleibt konstant).
  if (chips.length === 0) return <div className="h-5" />

  const hidden = chips.length - visible
  return (
    <div ref={rowRef} className="relative flex h-5 items-center gap-1 overflow-hidden">
      {chips.slice(0, visible).map((chip, i) => (
        <TagChip key={i} chip={chip} truncate />
      ))}
      {hidden > 0 && (
        <span className="text-text-muted bg-tag-bg border-border shrink-0 rounded-[3px] border px-1 py-0.5 text-[10px] tabular-nums">
          +{hidden}
        </span>
      )}
      {/* Versteckter Messer: alle Chips, beeinflusst die Höhe nicht (absolut). */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 flex gap-1"
      >
        {chips.map((chip, i) => (
          <TagChip key={i} chip={chip} truncate />
        ))}
      </div>
    </div>
  )
}
