import { useCallback, useEffect, useRef, useState } from 'react'
import type { Case, TagGroup } from '@/lib/types'
import { caseChips } from '@/lib/tags'
import { normalizeVideoPath, toFileUrl } from '@/lib/video'
import { TagChip } from './TagChip'

// Zoom-Grenzen + Schritt pro Rad-Rasterung (nicht endlos rein/raus).
const MAX_ZOOM = 4
const ZOOM_STEP = 1.2
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Vollbild-Ansicht eines Falls (PowerPoint-artig). Öffnet sich beim Klick auf
 * eine Kachel und bleibt im aktuell gefilterten Set: Pfeiltasten ←/→ (und die
 * Klick-Pfeile am Rand) blättern zum vorherigen/nächsten Fall, Esc schließt
 * zurück zur Übersicht.
 *
 * Aufbau von oben nach unten: Titel (Kopfzeile mit Aktionen) · großes Bild ·
 * Kategorie-Chips · aufklappbares Notizfeld ganz unten. Das Notizfeld klappt
 * per Klick auf die Kopfzeile auf/zu (bewusst kein Hover — das flackerte beim
 * Größenwechsel). Der Anfangszustand kommt aus den Einstellungen
 * (notesExpandedByDefault) und ist danach pro Ansicht frei umschaltbar.
 */
export function Lightbox({
  cases,
  index,
  tagGroups,
  notesDefaultOpen,
  onIndexChange,
  onEdit,
  onDelete,
  onClose,
}: {
  cases: Case[]
  index: number
  tagGroups: TagGroup[]
  notesDefaultOpen: boolean
  onIndexChange: (i: number) => void
  onEdit: (c: Case) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const c = cases[index]
  const hasPrev = index > 0
  const hasNext = index < cases.length - 1
  const [notesOpen, setNotesOpen] = useState(notesDefaultOpen)
  const rootRef = useRef<HTMLDivElement>(null)
  // Cooldown gegen Über-Springen: ein einzelner Trackpad-/Wheel-„Schwung"
  // feuert viele kleine deltaY-Events — wir blättern höchstens einmal je Fenster.
  const wheelLockRef = useRef(0)

  // Zoom/Pan-Zustand des aktuellen Bildes. State rendert das Transform,
  // transformRef hält denselben Wert für die Event-Handler bereit (kein Stale-
  // Closure, ohne den Wheel-Listener bei jedem Zoom neu zu registrieren).
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 })
  const transformRef = useRef(transform)
  transformRef.current = transform
  const imgRef = useRef<HTMLImageElement>(null)
  const imageAreaRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  )
  const [dragging, setDragging] = useState(false)

  // Pan-Versatz so begrenzen, dass das Bild den sichtbaren Bereich nicht ins
  // Leere verlässt: max. Versatz = halber Überhang über die Bildfläche.
  const clampOffset = useCallback((tx: number, ty: number, scale: number) => {
    const img = imgRef.current
    const area = imageAreaRef.current
    if (!img || !area) return { tx, ty }
    const ir = img.getBoundingClientRect()
    const ar = area.getBoundingClientRect()
    const renderedScale = transformRef.current.scale || 1
    const baseW = ir.width / renderedScale
    const baseH = ir.height / renderedScale
    const ovX = Math.max(0, (baseW * scale - ar.width) / 2)
    const ovY = Math.max(0, (baseH * scale - ar.height) / 2)
    return { tx: clamp(tx, -ovX, ovX), ty: clamp(ty, -ovY, ovY) }
  }, [])

  // Bei jedem Bildwechsel zurück auf 100 % (Zoom/Pan gehören zum einzelnen Bild).
  useEffect(() => {
    setTransform({ scale: 1, tx: 0, ty: 0 })
  }, [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1)
      else if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, hasPrev, hasNext, onClose, onIndexChange])

  // Mausrad: blankes Rad blättert wie ←/→, Strg/Cmd+Rad zoomt ins Bild.
  //
  // Die beiden Gesten schließen sich per `ctrlKey/metaKey` gegenseitig aus, also
  // kommen sie sich nie in die Quere. Wichtig für den Zoom: Der Listener ist
  // non-passive ({ passive: false }) UND ruft im Zoom-Zweig e.preventDefault()
  // auf — sonst fängt der Browser Strg+Rad ab und zoomt die ganze Seite statt
  // des Bildes. Reine Notizen (kein <img>) lassen wir bewusst durch (kein
  // Bild-Zoom → Browser-Default). Scrollbare Innenbereiche (Notizen/Text) sind
  // beim Blättern per [data-scrollable] ausgenommen.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const img = imgRef.current
        if (!img) return // reiner Notiz-Fall: kein Bild-Zoom
        e.preventDefault() // Browser-Seiten-Zoom unterdrücken
        const cur = transformRef.current
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
        const newScale = clamp(cur.scale * factor, 1, MAX_ZOOM)
        if (newScale === cur.scale) return
        // Zoom zum Cursor: der Punkt unter der Maus bleibt stehen.
        const ir = img.getBoundingClientRect()
        const vx = e.clientX - (ir.left + ir.width / 2)
        const vy = e.clientY - (ir.top + ir.height / 2)
        const r = newScale / cur.scale
        let tx = cur.tx + (1 - r) * vx
        let ty = cur.ty + (1 - r) * vy
        if (newScale === 1) {
          tx = 0
          ty = 0
        }
        const cl = clampOffset(tx, ty, newScale)
        setTransform({ scale: newScale, tx: cl.tx, ty: cl.ty })
        return
      }
      const target = e.target as HTMLElement
      if (target.closest('[data-scrollable]')) return
      if (Math.abs(e.deltaY) < 1) return
      e.preventDefault()
      const now = Date.now()
      if (now < wheelLockRef.current) return
      wheelLockRef.current = now + 250
      if (e.deltaY > 0 && hasNext) onIndexChange(index + 1)
      else if (e.deltaY < 0 && hasPrev) onIndexChange(index - 1)
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [index, hasPrev, hasNext, onIndexChange, clampOffset])

  // Set kann sich unter der Ansicht ändern (Filter/Löschen) — der Aufrufer
  // klemmt den Index, hier nur defensiv abfangen.
  if (!c) return null

  const chips = caseChips(c, tagGroups)
  const hasNotes = c.notes.trim() !== ''
  const zoomed = transform.scale > 1

  // Bild im gezoomten Zustand mit der Maus verschieben (Pan). PointerCapture
  // hält den Drag auch außerhalb des Bildes; bei 100 % ist Pan aus.
  function onImagePointerDown(e: React.PointerEvent<HTMLImageElement>) {
    if (transformRef.current.scale <= 1) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transformRef.current.tx,
      ty: transformRef.current.ty,
    }
    setDragging(true)
  }
  function onImagePointerMove(e: React.PointerEvent<HTMLImageElement>) {
    const d = dragRef.current
    if (!d) return
    const cl = clampOffset(
      d.tx + (e.clientX - d.x),
      d.ty + (e.clientY - d.y),
      transformRef.current.scale,
    )
    setTransform((t) => ({ ...t, tx: cl.tx, ty: cl.ty }))
  }
  function onImagePointerUp() {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
  }

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Kopfzeile: zentrierter Titel, Aktionen rechts (linker Spacer balanciert
          die Zentrierung aus, damit der Titel wirklich mittig sitzt). */}
      <div className="flex shrink-0 items-center gap-3 px-5 py-3.5">
        <div className="flex-1" />
        <h2 className="max-w-[55%] text-center text-lg font-semibold break-words whitespace-normal text-white">
          {c.title || '(ohne Titel)'}
        </h2>
        <div className="flex flex-1 items-center justify-end gap-3">
          <span className="text-text-muted shrink-0 text-xs tabular-nums">
            {index + 1} / {cases.length}
          </span>
          <button
            type="button"
            onClick={() => onEdit(c)}
            className="bg-surface-2 border-border text-text hover:border-accent shrink-0 rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] transition-colors"
          >
            Bearbeiten
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Fall wirklich löschen?')) onDelete(c.id)
            }}
            className="bg-surface-2 border-border text-text-muted hover:border-danger hover:text-danger shrink-0 rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] transition-colors"
          >
            Löschen
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="text-text-muted hover:text-text shrink-0 px-1.5 text-2xl leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Bildbereich mit seitlichen Navigationspfeilen */}
      <div
        ref={imageAreaRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-16"
      >
        <NavArrow
          side="left"
          disabled={!hasPrev}
          onClick={() => onIndexChange(index - 1)}
        />

        {c.image ? (
          <img
            ref={imgRef}
            src={c.image}
            alt={c.title}
            draggable={false}
            onPointerDown={onImagePointerDown}
            onPointerMove={onImagePointerMove}
            onPointerUp={onImagePointerUp}
            onPointerCancel={onImagePointerUp}
            onDoubleClick={() => setTransform({ scale: 1, tx: 0, ty: 0 })}
            style={{
              transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
              cursor: zoomed ? (dragging ? 'grabbing' : 'grab') : 'default',
              transition: dragging ? 'none' : 'transform 80ms ease-out',
              willChange: 'transform',
              touchAction: 'none',
            }}
            className="max-h-full max-w-full object-contain select-none"
          />
        ) : (
          <div
            data-scrollable
            className="max-h-full max-w-[640px] overflow-y-auto px-2 text-[16px] leading-relaxed whitespace-pre-wrap text-white"
          >
            {c.notes.trim() || c.description.trim() || '(kein Text)'}
          </div>
        )}

        <NavArrow
          side="right"
          disabled={!hasNext}
          onClick={() => onIndexChange(index + 1)}
        />
      </div>

      {/* Video-Zugang (nur Video-Fälle): Pfad + Abspielen/Kopieren. */}
      {c.videoPath && (
        <div className="mx-auto w-full max-w-[1000px] shrink-0 px-5 pt-2">
          <VideoAccess path={c.videoPath} />
        </div>
      )}

      {/* Fußbereich: Kategorie-Chips, darunter das aufklappbare Notizfeld */}
      {(chips.length > 0 || (c.image && hasNotes)) && (
        <div className="mx-auto w-full max-w-[1000px] shrink-0 px-5 pb-4">
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 py-3">
              {chips.map((chip, i) => (
                <TagChip key={i} chip={chip} />
              ))}
            </div>
          )}

          {/* Notizfeld nur bei Bild-Fällen mit Notiz — bei reinen Notizen ist der
              Text bereits der zentrale Inhalt oben. */}
          {c.image && hasNotes && (
            <div className="border-border/50 border-t">
              <button
                type="button"
                onClick={() => setNotesOpen((v) => !v)}
                aria-expanded={notesOpen}
                className="text-text-muted hover:text-text flex w-full items-center gap-2 py-2.5 text-left text-[13px] font-semibold tracking-[0.04em] uppercase transition-colors"
              >
                <span className="text-xs">{notesOpen ? '▾' : '▸'}</span>
                📝 Notizen
              </button>
              {notesOpen && (
                <div
                  data-scrollable
                  className="max-h-[30vh] overflow-y-auto pb-3 text-[16px] leading-relaxed whitespace-pre-wrap text-white"
                >
                  {c.notes}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Video-Zugang im Detail: Pfad-Feld + zwei Knöpfe. „Abspielen" ist Best-Effort
 * (window.open auf file:// — von Chromium aus http/localhost meist blockiert);
 * „Kopieren" ist der verlässliche Weg (Pfad → Explorer/Finder einfügen). Der
 * Pfad-bricht-Hinweis bleibt bewusst dezent.
 */
function VideoAccess({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Defensive Säuberung — auch falls ein Altbestand-Pfad noch Quotes trägt.
  const clean = normalizeVideoPath(path)

  const play = () => {
    window.open(toFileUrl(clean), '_blank', 'noopener')
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clean)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard-API nicht verfügbar/erlaubt → Pfad markieren, Strg+C dem Nutzer.
      inputRef.current?.select()
    }
  }

  return (
    <div className="border-border/50 border-t pt-2.5">
      <div className="text-text-muted mb-1.5 flex items-center gap-2 text-[13px] font-semibold tracking-[0.04em] uppercase">
        🎬 Video
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          readOnly
          value={clean}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Pfad zur Videodatei"
          className="bg-bg border-border text-text min-w-[200px] flex-1 rounded-[var(--radius-card)] border px-2.5 py-1.5 font-mono text-[12px] outline-none"
        />
        <button
          type="button"
          onClick={play}
          className="bg-surface-2 border-border text-text hover:border-accent inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] transition-colors"
        >
          ▶ Abspielen
        </button>
        <button
          type="button"
          onClick={copy}
          className="bg-surface-2 border-border text-text hover:border-accent inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] transition-colors"
        >
          {copied ? 'Kopiert ✓' : 'Kopieren'}
        </button>
      </div>
      <p className="text-text-muted mt-1.5 text-[11px] leading-relaxed opacity-70">
        „Abspielen" kann je nach Browser blockiert sein — dann „Kopieren" und im
        Explorer/Finder einfügen. Pfad bricht bei Verschieben/Umbenennen.
      </p>
    </div>
  )
}

function NavArrow({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={side === 'left' ? 'Vorheriger Fall' : 'Nächster Fall'}
      className={[
        'absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-3xl leading-none transition-colors',
        side === 'left' ? 'left-2' : 'right-2',
        disabled
          ? 'text-text-muted cursor-default opacity-20'
          : 'text-text-muted hover:bg-surface-2 hover:text-text',
      ].join(' ')}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  )
}
