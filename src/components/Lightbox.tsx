import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Annotation, AnnotationColor, Case, TagGroup } from '@/lib/types'
import { caseChips } from '@/lib/tags'
import {
  isEmbeddedVideo,
  isReferencedVideo,
  isVideoCase,
  normalizeVideoPath,
  toFileUrl,
} from '@/lib/video'
import {
  ANNOTATION_COLORS,
  STROKE_WIDTHS,
  DEFAULT_STROKE_PX,
  annotationAnchor,
  colorHex,
  computeAnnotationIndices,
  hasLabel,
} from '@/lib/annotations'
import { AnnotationLayer, type ToolKind } from './AnnotationLayer'
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
  onAnnotationsChange,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  onClose,
}: {
  cases: Case[]
  index: number
  tagGroups: TagGroup[]
  notesDefaultOpen: boolean
  onIndexChange: (i: number) => void
  onEdit: (c: Case) => void
  onDelete: (id: string) => void
  /** Annotationen eines Falls persistieren (über updateCase → Dual-Write/Undo). */
  onAnnotationsChange: (id: string, annotations: Annotation[]) => void
  /** Strg/Cmd+Z — auch in der Lightbox aktiv (vor allem fürs Annotieren). */
  onUndo: () => void
  /** Ob ein Undo-Schritt verfügbar ist (für den Toolbar-Button). */
  canUndo: boolean
  /** Strg/Cmd+Y bzw. Strg/Cmd+Shift+Z — Gegenstück zu onUndo. */
  onRedo: () => void
  /** Ob ein Redo-Schritt verfügbar ist (für den Toolbar-Button). */
  canRedo: boolean
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
  // Pointer-Down-Zustand für den Hintergrund-Klick (Schließen neben dem Bild) —
  // hier oben deklariert, damit der Hook nicht hinter dem Early-Return steht.
  const backdropDownRef = useRef<{ x: number; y: number; onBackdrop: boolean } | null>(
    null,
  )

  // Annotations-Zustand (Backlog #17). Nur für reine Bild-Fälle relevant.
  const [annotationsVisible, setAnnotationsVisible] = useState(true)
  const [drawMode, setDrawMode] = useState(false)
  // Default 'select' (Auswahl/Bewegen): Zeichen-Modus betritt man „sicher" zum
  // Schauen/Auswählen/Zoomen — ein Zeichen-Werkzeug wählt man bewusst.
  const [tool, setTool] = useState<ToolKind>('select')
  const [annColor, setAnnColor] = useState<AnnotationColor>('red')
  // Ziel-Strichstärke (CSS-px) für neu gezeichnete Formen.
  const [annWidth, setAnnWidth] = useState<number>(DEFAULT_STROKE_PX)
  // Mehrfachauswahl: IDs der ausgewählten Formen (gemeinsam löschen/umfärben).
  const [selectedAnnIds, setSelectedAnnIds] = useState<string[]>([])
  // Label-Editor: welche Annotation wird gerade beschriftet (null = kein Editor),
  // lokaler Entwurf (Commit gebündelt bei Enter/Blur → eine Mutation), und die
  // Bildschirm-Position des schwebenden Eingabefelds.
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null)
  const [labelDraft, setLabelDraft] = useState('')
  const [labelPos, setLabelPos] = useState<{ x: number; y: number } | null>(null)
  const labelInputRef = useRef<HTMLInputElement>(null)
  // Fokus nur beim NEU gezeichneten Label automatisch setzen (beim bloßen
  // Auswählen erscheint das Feld ohne Fokus, damit Entf weiter die Form löscht).
  const labelAutoFocusRef = useRef(false)
  // Esc soll verwerfen (nicht committen) — Flag, das der Blur-Commit respektiert.
  const labelCancelRef = useRef(false)
  // Natürliche Bildmaße aus onLoad — die SVG-viewBox braucht sie für die
  // uniforme Abbildung (siehe AnnotationLayer).
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  )
  // Im Wheel-/Pan-Handler ohne erneutes Registrieren lesbar.
  const drawModeRef = useRef(drawMode)
  drawModeRef.current = drawMode

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

  // Bei jedem Bildwechsel zurück auf 100 % (Zoom/Pan gehören zum einzelnen Bild)
  // und Annotations-Auswahl zurücksetzen.
  useEffect(() => {
    setTransform({ scale: 1, tx: 0, ty: 0 })
    setSelectedAnnIds([])
    setEditingAnnId(null)
  }, [index])

  // Bildschirm-Position des Label-Eingabefelds aus dem Annotation-Anker × der
  // live gemessenen Bild-Box berechnen (enthält Zoom/Pan). Recompute bei Zoom
  // (transform), Editor-Wechsel, Bildmaßen und Fenster-Resize. Geklemmt in den
  // Bildbereich, damit das Feld nie aus dem Bild rutscht.
  useLayoutEffect(() => {
    if (!editingAnnId) {
      setLabelPos(null)
      return
    }
    const measure = () => {
      const ann = (c?.annotations ?? []).find((a) => a.id === editingAnnId)
      const img = imgRef.current
      if (!ann || !img) {
        setLabelPos(null)
        return
      }
      const r = img.getBoundingClientRect()
      const anchor = annotationAnchor(ann)
      setLabelPos({
        x: clamp(r.left + anchor.x * r.width + 8, r.left + 4, Math.max(r.left + 4, r.right - 4)),
        y: clamp(r.top + anchor.y * r.height + 8, r.top + 4, Math.max(r.top + 4, r.bottom - 4)),
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [editingAnnId, transform, c, naturalSize])

  // Neu gezeichnetes Label sofort fokussieren (Auswahl-Label bleibt unfokussiert).
  useEffect(() => {
    if (editingAnnId && labelAutoFocusRef.current) {
      labelAutoFocusRef.current = false
      requestAnimationFrame(() => labelInputRef.current?.focus())
    }
  }, [editingAnnId])

  // Natürliche Bildmaße (für die SVG-viewBox) robust pro angezeigtem Bild
  // ermitteln. Wichtig fürs Zurückblättern: ein bereits gecachtes/decodiertes
  // Bild feuert oft KEIN erneutes onLoad — dann ist `complete` aber schon true,
  // und wir lesen die Maße direkt. Sonst null setzen; onLoad liefert sie nach.
  useEffect(() => {
    const el = imgRef.current
    if (el?.complete && el.naturalWidth) {
      setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight })
    } else {
      setNaturalSize(null)
    }
  }, [c?.image])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Strg/Cmd+Z (Undo) bzw. Strg/Cmd+Shift+Z / Strg/Cmd+Y (Redo) direkt in
      // der Lightbox (auch im Zeichen-Modus) — genau dort, wo man es beim
      // Annotieren braucht. Nicht in Texteingaben kapern.
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase()
        const isUndo = !e.shiftKey && k === 'z'
        const isRedo = (e.shiftKey && k === 'z') || (!e.shiftKey && k === 'y')
        if (isUndo || isRedo) {
          const el = document.activeElement as HTMLElement | null
          if (
            el &&
            (el.tagName === 'INPUT' ||
              el.tagName === 'TEXTAREA' ||
              el.isContentEditable)
          )
            return
          e.preventDefault()
          if (isUndo) onUndo()
          else onRedo()
          return
        }
      }
      if (e.key === 'Escape') {
        // Erst aus dem Zeichen-Modus, dann erst die Lightbox schließen.
        if (drawMode) {
          setDrawMode(false)
          setSelectedAnnIds([])
          setEditingAnnId(null)
        } else onClose()
        return
      }
      if (drawMode) {
        // Bei fokussiertem Label-Feld weder löschen noch sonst kapern.
        const el = document.activeElement as HTMLElement | null
        const inField =
          !!el &&
          (el.tagName === 'INPUT' ||
            el.tagName === 'TEXTAREA' ||
            el.isContentEditable)
        if (
          !inField &&
          (e.key === 'Delete' || e.key === 'Backspace') &&
          selectedAnnIds.length > 0
        ) {
          const cur = cases[index]
          if (cur) {
            onAnnotationsChange(
              cur.id,
              (cur.annotations ?? []).filter((a) => !selectedAnnIds.includes(a.id)),
            )
            setSelectedAnnIds([])
            setEditingAnnId(null)
          }
        }
        return // im Zeichen-Modus nicht blättern
      }
      if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1)
      else if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [
    index,
    hasPrev,
    hasNext,
    onClose,
    onIndexChange,
    onUndo,
    onRedo,
    drawMode,
    selectedAnnIds,
    cases,
    onAnnotationsChange,
  ])

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
      // Im Zeichen-Modus nicht blättern (Strg+Rad-Zoom oben bleibt erlaubt).
      if (drawModeRef.current) return
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

  // Reiner Bild-Fall (kein Video): nur hier sind Annotationen möglich.
  const isImageCase = c.image !== null && !isVideoCase(c)
  const annotations = c.annotations ?? []
  const hasAnnotations = annotations.length > 0
  // Index pro beschrifteter Annotation (Form+Farbe-Gruppen) — für Bild-Badge und
  // Liste, identisch per Konstruktion. Günstig (O(n)), daher kein useMemo nötig.
  const annIndices = computeAnnotationIndices(annotations)
  const labeledAnnotations = annotations.filter(hasLabel)

  // Label-Editor öffnen (Annotation auswählen → vorbefüllen, kein Auto-Fokus).
  const openLabelEditor = (id: string, autoFocus: boolean) => {
    const ann = annotations.find((a) => a.id === id)
    setEditingAnnId(id)
    setLabelDraft(ann?.label ?? '')
    labelAutoFocusRef.current = autoFocus
    labelCancelRef.current = false // frische Sitzung: kein verwaistes Verwerf-Flag
  }
  // Lokalen Entwurf als Label persistieren (eine Mutation). Esc verwirft via Flag.
  const commitLabel = () => {
    if (labelCancelRef.current) {
      labelCancelRef.current = false
      return
    }
    if (!editingAnnId) return
    const ann = annotations.find((a) => a.id === editingAnnId)
    if (!ann) return
    const next = labelDraft.trim()
    if (next === (ann.label ?? '')) return
    onAnnotationsChange(
      c.id,
      annotations.map((a) =>
        a.id === editingAnnId ? { ...a, label: next || undefined } : a,
      ),
    )
  }

  const addAnnotation = (a: Annotation) => {
    onAnnotationsChange(c.id, [...annotations, a])
    setSelectedAnnIds([a.id])
    // Neu gezeichnet → Label-Feld öffnen und fokussieren (direkt lostippen).
    openLabelEditor(a.id, true)
  }
  const deleteSelected = () => {
    if (selectedAnnIds.length === 0) return
    onAnnotationsChange(
      c.id,
      annotations.filter((a) => !selectedAnnIds.includes(a.id)),
    )
    setSelectedAnnIds([])
    setEditingAnnId(null)
  }
  // Alle Formen des Bildes auf einmal auswählen (gemeinsam löschen/umfärben).
  const selectAll = () => {
    setSelectedAnnIds(annotations.map((a) => a.id))
    setEditingAnnId(null) // Mehrfachauswahl → kein Einzel-Label-Editor
  }
  // Liste → Bild: Klick auf eine Zeile wählt die Annotation im Bild aus. Ist der
  // Zeichen-Modus aus, wird er aktiviert (mit Auswahl/Bewegen), da Auswahl/
  // Bearbeitung dort stattfindet. Label-Editor erscheint (ohne Fokus, wie Form-Klick).
  const selectFromList = (id: string) => {
    if (!drawMode) {
      setDrawMode(true)
      setTool('select')
      setAnnotationsVisible(true)
    }
    setSelectedAnnIds([id])
    openLabelEditor(id, false)
  }
  // Farbklick: ausgewählte Form(en) umfärben (sonst nur Farbe fürs nächste Zeichnen).
  const pickColor = (color: AnnotationColor) => {
    setAnnColor(color)
    if (selectedAnnIds.length > 0) {
      onAnnotationsChange(
        c.id,
        annotations.map((a) => (selectedAnnIds.includes(a.id) ? { ...a, color } : a)),
      )
    }
  }
  // Strichstärke-Klick: ausgewählte Form(en) anpassen (sonst nur fürs nächste Zeichnen).
  const pickWidth = (strokeWidth: number) => {
    setAnnWidth(strokeWidth)
    if (selectedAnnIds.length > 0) {
      onAnnotationsChange(
        c.id,
        annotations.map((a) =>
          selectedAnnIds.includes(a.id) ? { ...a, strokeWidth } : a,
        ),
      )
    }
  }

  // Pan ist im Zeichen-Modus AUS, außer beim Auswahl/Bewegen-Werkzeug — dort soll
  // man wie in der normalen Lightbox zoomen/pannen, ohne den Modus zu verlassen.
  const panAllowed = !drawMode || tool === 'select'

  // Bild im gezoomten Zustand mit der Maus verschieben (Pan). PointerCapture
  // hält den Drag auch außerhalb des Bildes; bei 100 % bzw. wenn Pan nicht
  // erlaubt ist (Zeichen-Werkzeug aktiv), aus.
  function onStagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!panAllowed || transformRef.current.scale <= 1) return
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
  function onStagePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    const cl = clampOffset(
      d.tx + (e.clientX - d.x),
      d.ty + (e.clientY - d.y),
      transformRef.current.scale,
    )
    setTransform((t) => ({ ...t, tx: cl.tx, ty: cl.ty }))
  }
  function onStagePointerUp() {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
  }

  // Klick auf den leeren dunklen Hintergrund neben dem Bild schließt die
  // Lightbox — aber nur ein ECHTER Leerklick: nicht im Zeichen-Modus, nicht auf
  // Inhalt (Bild/Video/Notiz/Pfeile/Buttons) und nicht als Ende eines Pan-/
  // Zoom-Drags. Schließbar sind nur die zwei mit data-lb-backdrop markierten
  // Container (Seitenstreifen + Stage-Leerraum); alles andere trägt das Attribut
  // nicht und schließt daher nie. (backdropDownRef ist oben bei den Refs
  // deklariert, damit kein Hook hinter dem Early-Return steht.)
  const isBackdrop = (t: EventTarget | null) =>
    t instanceof HTMLElement && t.dataset.lbBackdrop !== undefined
  function onAreaPointerDownCapture(e: React.PointerEvent) {
    // Capture-Phase: den echten Ursprungs-Knoten sehen, BEVOR der Stage-Wrapper
    // bei gezoomtem Bild setPointerCapture macht und das Ziel umlenkt.
    backdropDownRef.current = {
      x: e.clientX,
      y: e.clientY,
      onBackdrop: isBackdrop(e.target),
    }
  }
  function onAreaPointerUp(e: React.PointerEvent) {
    const d = backdropDownRef.current
    backdropDownRef.current = null
    if (drawMode || e.button !== 0 || !d) return
    // (2) Klick auf Inhalt: Start ODER Ende nicht auf dem Backdrop → nicht schließen.
    if (!d.onBackdrop || !isBackdrop(e.target)) return
    // (3) Drag-Ende: nennenswerte Bewegung seit dem Druck → nicht schließen.
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return
    onClose()
  }

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Kopfzeile: zentrierter Titel im Fluss, die beiden Aktions-Gruppen ABSOLUT
          mit konstantem Abstand vom oberen Rand verankert. So bleiben die Buttons
          beim Blättern an fester Position, auch wenn der Titel pro Fall mehr/
          weniger Zeilen umbricht (sonst zentriert items-center sie mit der
          Titelhöhe neu → sie springen). */}
      <div className="relative shrink-0 px-5 py-3.5">
        <div className="absolute top-3.5 left-5 flex items-center gap-2">
          {isImageCase && hasAnnotations && (
            <HeaderToggle
              active={annotationsVisible}
              onClick={() => setAnnotationsVisible((v) => !v)}
              title={
                annotationsVisible
                  ? 'Markierungen ausblenden'
                  : 'Markierungen einblenden'
              }
            >
              {annotationsVisible ? <EyeIcon /> : <EyeOffIcon />}
              <span className="hidden sm:inline">Markierungen</span>
            </HeaderToggle>
          )}
          {isImageCase && (
            <HeaderToggle
              active={drawMode}
              onClick={() => {
                const entering = !drawMode
                setDrawMode(entering)
                if (entering) setTool('select') // sicher betreten: nicht sofort zeichnen
                setSelectedAnnIds([])
                setEditingAnnId(null)
                setAnnotationsVisible(true)
              }}
              title="Markierungen zeichnen / bearbeiten"
            >
              <PencilIcon />
              <span className="hidden sm:inline">Zeichnen</span>
            </HeaderToggle>
          )}
        </div>
        <h2 className="mx-auto max-w-[55%] text-center text-lg font-semibold break-words whitespace-normal text-white">
          {c.title || '(ohne Titel)'}
        </h2>
        <div className="absolute top-3.5 right-5 flex items-center gap-3">
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
        data-lb-backdrop
        onPointerDownCapture={onAreaPointerDownCapture}
        onPointerUp={onAreaPointerUp}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-16"
      >
        {!drawMode && (
          <NavArrow
            side="left"
            disabled={!hasPrev}
            onClick={() => onIndexChange(index - 1)}
          />
        )}

        {isEmbeddedVideo(c) ? (
          // Eingebettetes Video: integrierter HTML5-Player mit nativen Controls.
          // Bewusst OHNE die Bild-Zoom/Pan-Handler — die Pointer-/Wheel-Gesten
          // gehören hier den Controls (Scrubben, Lautstärke). Das Thumbnail dient
          // als Poster bis zum ersten Frame.
          <video
            src={c.videoData}
            poster={c.image ?? undefined}
            controls
            controlsList="nodownload"
            className="max-h-full max-w-full bg-black object-contain select-none"
          />
        ) : c.image ? (
          // Stage-Wrapper trägt das Transform und stapelt Bild + Annotations-
          // Overlay im selben Grid-Feld (place-items-center). Beide skalieren über
          // max-h/max-w auf dieselbe Box (object-contain bzw. intrinsische SVG-
          // Maße) → sie überlagern sich exakt und zoomen/pannen gemeinsam.
          //
          // grid-template-rows/-cols: minmax(0,1fr) — KRITISCH für hohe Bilder:
          // ein auto-Track würde sich an der intrinsischen Bildhöhe bemessen und
          // max-height ignorieren (zirkulär), das Bild liefe unten aus der Bühne
          // (overflow-hidden schneidet ab). Der 1fr-Track ist an die definite
          // Bühnenhöhe gebunden → max-h/max-w-full greifen zusammen, das Bild
          // passt vollständig hinein, und img wie SVG schrumpfen aspektgetreu auf
          // dieselbe Box (Overlay bleibt deckungsgleich).
          <div
            data-lb-backdrop
            className="absolute inset-y-0 inset-x-16 grid [grid-template-columns:minmax(0,1fr)] [grid-template-rows:minmax(0,1fr)] place-items-center"
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            onDoubleClick={() =>
              !drawMode && setTransform({ scale: 1, tx: 0, ty: 0 })
            }
            style={{
              transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
              cursor:
                panAllowed && zoomed
                  ? dragging
                    ? 'grabbing'
                    : 'grab'
                  : 'default',
              transition: dragging ? 'none' : 'transform 80ms ease-out',
              willChange: 'transform',
              touchAction: 'none',
            }}
          >
            <img
              ref={imgRef}
              src={c.image}
              alt={c.title}
              draggable={false}
              onLoad={(e) =>
                setNaturalSize({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
              }
              className="col-start-1 row-start-1 block max-h-full max-w-full object-contain select-none"
            />
            {naturalSize && (
              <AnnotationLayer
                className="col-start-1 row-start-1"
                annotations={annotations}
                visible={annotationsVisible}
                naturalW={naturalSize.w}
                naturalH={naturalSize.h}
                zoomScale={transform.scale}
                drawMode={drawMode}
                tool={tool}
                color={annColor}
                strokeWidth={annWidth}
                selectedIds={selectedAnnIds}
                indices={annIndices}
                onSelect={(id) => {
                  setSelectedAnnIds(id ? [id] : [])
                  // Einzelne Form anklicken → Label-Feld zeigen (ohne Fokus, damit
                  // Entf weiter löscht). Hintergrund/null → Editor schließen.
                  if (id) openLabelEditor(id, false)
                  else setEditingAnnId(null)
                }}
                onCreate={addAnnotation}
              />
            )}
          </div>
        ) : (
          <div
            data-scrollable
            className="max-h-full max-w-[640px] overflow-y-auto px-2 text-[16px] leading-relaxed whitespace-pre-wrap text-white"
          >
            {c.notes.trim() || c.description.trim() || '(kein Text)'}
          </div>
        )}

        {!drawMode && (
          <NavArrow
            side="right"
            disabled={!hasNext}
            onClick={() => onIndexChange(index + 1)}
          />
        )}

        {/* Schwebende Zeichen-Werkzeugleiste (nur im Zeichen-Modus). */}
        {drawMode && isImageCase && (
          <DrawToolbar
            tool={tool}
            onToolChange={setTool}
            color={annColor}
            onColorChange={pickColor}
            width={annWidth}
            onWidthChange={pickWidth}
            canDelete={selectedAnnIds.length > 0}
            onDelete={deleteSelected}
            canSelectAll={annotations.length > 0}
            onSelectAll={selectAll}
            canUndo={canUndo}
            onUndo={onUndo}
            canRedo={canRedo}
            onRedo={onRedo}
            onExit={() => {
              setDrawMode(false)
              setSelectedAnnIds([])
            }}
          />
        )}
      </div>

      {/* Schwebendes Label-Eingabefeld im Screen-Space (nicht im transformierten
          Wrapper → bei jedem Zoom konstant lesbar). Position folgt der Annotation
          über labelPos. Eingabe optional; leer = unbeschriftet. */}
      {drawMode && isImageCase && editingAnnId && labelPos && (
        <input
          ref={labelInputRef}
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => {
            // Eigene Tasten behalten (kein Blättern/Löschen/Modus-Verlassen global).
            e.stopPropagation()
            if (e.key === 'Enter') {
              commitLabel()
              setEditingAnnId(null)
            } else if (e.key === 'Escape') {
              labelCancelRef.current = true // Blur-Commit überspringen (verwerfen)
              setEditingAnnId(null)
            }
          }}
          placeholder="Beschriftung … (optional)"
          className="bg-surface/95 border-border text-text focus:border-accent fixed z-[60] w-52 rounded-[var(--radius-card)] border px-2.5 py-1.5 text-[13px] shadow-lg outline-none backdrop-blur"
          style={{ left: labelPos.x, top: labelPos.y }}
        />
      )}

      {/* Video-Zugang nur für REFERENZIERTE Fälle: Pfad + Abspielen/Kopieren.
          Eingebettete Videos laufen oben im Player — kein Pfad-Zugang nötig. */}
      {isReferencedVideo(c) && c.videoPath && (
        <div className="mx-auto w-full max-w-[1000px] shrink-0 px-5 pt-2">
          <VideoAccess path={c.videoPath} />
        </div>
      )}

      {/* Fußbereich: Kategorie-Chips, Notizfeld, darunter die „Markierungen"-Liste */}
      {(chips.length > 0 ||
        ((c.image || isEmbeddedVideo(c)) && hasNotes) ||
        (isImageCase && labeledAnnotations.length > 0)) && (
        <div className="mx-auto w-full max-w-[1000px] shrink-0 px-5 pb-4">
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 py-3">
              {chips.map((chip, i) => (
                <TagChip key={i} chip={chip} />
              ))}
            </div>
          )}

          {/* Notizfeld bei Bild- und Video-Fällen mit Notiz — bei reinen Notizen
              ist der Text bereits der zentrale Inhalt oben. */}
          {(c.image || isEmbeddedVideo(c)) && hasNotes && (
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

          {/* „Markierungen": eine Zeile je BESCHRIFTETER Annotation — Form-Symbol
              + optionaler Index + Label, alles in der Annotationsfarbe. Index nur,
              wenn indiziert (≥ 2 gleiche Form+Farbe), passend zum Bild-Badge. */}
          {isImageCase && labeledAnnotations.length > 0 && (
            <div className="border-border/50 border-t">
              <div className="text-text-muted flex items-center gap-2 py-2.5 text-[13px] font-semibold tracking-[0.04em] uppercase">
                ✏️ Markierungen
              </div>
              <ul className="max-h-[24vh] space-y-1 overflow-y-auto pb-3" data-scrollable>
                {labeledAnnotations.map((a) => {
                  const n = annIndices.get(a.id)
                  const isSelected = selectedAnnIds.includes(a.id)
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => selectFromList(a.id)}
                        title="Im Bild auswählen"
                        className={[
                          'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[15px] leading-snug transition-colors',
                          isSelected ? 'bg-surface-2' : 'hover:bg-surface-2/60',
                        ].join(' ')}
                        style={{ color: colorHex(a.color) }}
                      >
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <AnnShapeIcon type={a.type} />
                          {typeof n === 'number' && (
                            <span className="text-[12px] font-bold tabular-nums">{n}</span>
                          )}
                        </span>
                        <span className="break-words">{a.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Form-Symbol für die „Markierungen"-Liste (erbt die Farbe über currentColor). */
function AnnShapeIcon({ type }: { type: Annotation['type'] }) {
  if (type === 'arrow') return <ArrowIcon />
  if (type === 'circle') return <CircleIcon />
  return <RectIcon />
}

/** Umschalt-Knopf in der Lightbox-Kopfzeile (Markierungen anzeigen / Zeichnen). */
function HeaderToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={[
        'inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border px-3 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-accent border-accent text-white'
          : 'bg-surface-2 border-border text-text hover:border-accent',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** Höhe des Stärke-Balkens (px) je Stufe — für Trigger und Aufklapp-Optionen. */
const STROKE_BAR_PX: Record<'thin' | 'medium' | 'thick', number> = {
  thin: 1.5,
  medium: 3,
  thick: 5,
}

/** Waagrechter Balken, dessen Höhe die Strichstärke andeutet (erbt Textfarbe). */
function WidthBar({ k }: { k: 'thin' | 'medium' | 'thick' }) {
  return (
    <span
      className="block w-4 rounded-full bg-current"
      style={{ height: `${STROKE_BAR_PX[k]}px` }}
    />
  )
}

/**
 * Aufklappbares Auswahl-Element der Werkzeugleiste (Form / Farbe / Strichstärke).
 * Der zugeklappte Knopf zeigt die aktuelle Wahl (Trigger) — der aktive Zustand
 * ist also ohne Aufklappen erkennbar. Geöffnet erscheint ein kleines Flyout
 * UNTER dem Knopf (verdeckt das Bild nur, solange offen). Schließen über Wahl
 * (vom Aufrufer) oder Außenklick/Esc (zentral in DrawToolbar).
 */
function ToolbarMenu({
  open,
  onToggle,
  title,
  trigger,
  children,
}: {
  open: boolean
  onToggle: () => void
  title: string
  trigger: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          'flex h-7 items-center gap-1 rounded border px-1.5 transition-colors',
          open
            ? 'bg-surface-2 border-accent text-text'
            : 'bg-surface-2 border-border text-text hover:border-accent',
        ].join(' ')}
      >
        {trigger}
        <ChevronIcon />
      </button>
      {open && (
        <div
          role="menu"
          className="bg-surface/95 border-border absolute top-full left-1/2 z-30 mt-1 flex -translate-x-1/2 items-center gap-1 rounded-[var(--radius-card)] border p-1 shadow-lg backdrop-blur"
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** Schwebende Werkzeugleiste im Zeichen-Modus: Form · Farbe · Stärke (aufklappbar)
 *  + direkte Aktionen (Alle markieren · Undo · Redo · Löschen · Schließen). */
function DrawToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  width,
  onWidthChange,
  canDelete,
  onDelete,
  canSelectAll,
  onSelectAll,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onExit,
}: {
  tool: ToolKind
  onToolChange: (t: ToolKind) => void
  color: AnnotationColor
  onColorChange: (c: AnnotationColor) => void
  /** Aktuelle Strichstärke (CSS-px) für neue Formen. */
  width: number
  onWidthChange: (w: number) => void
  canDelete: boolean
  onDelete: () => void
  canSelectAll: boolean
  onSelectAll: () => void
  canUndo: boolean
  onUndo: () => void
  canRedo: boolean
  onRedo: () => void
  onExit: () => void
}) {
  // Genau ein Aufklapp-Menü offen (oder keins). Öffnen eines schließt das andere.
  const [openMenu, setOpenMenu] = useState<null | 'tool' | 'color' | 'width'>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Offenes Menü bei Außenklick oder Esc schließen (verdeckt das Bild nicht
  // dauerhaft). Esc in der Capture-Phase abfangen + stoppen, damit es NUR das
  // Menü schließt und nicht zugleich den Zeichen-Modus verlässt.
  useEffect(() => {
    if (!openMenu) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpenMenu(null)
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [openMenu])

  const tools: { key: ToolKind; label: string; icon: React.ReactNode }[] = [
    { key: 'select', label: 'Auswählen / Bewegen (zoomen & verschieben)', icon: <CursorIcon /> },
    { key: 'arrow', label: 'Pfeil', icon: <ArrowIcon /> },
    { key: 'circle', label: 'Kreis', icon: <CircleIcon /> },
    { key: 'rect', label: 'Rechteck', icon: <RectIcon /> },
  ]
  const currentTool = tools.find((t) => t.key === tool) ?? tools[0]
  const currentColor = ANNOTATION_COLORS.find((c) => c.key === color) ?? ANNOTATION_COLORS[0]
  const currentWidth = STROKE_WIDTHS.find((w) => w.px === width) ?? STROKE_WIDTHS[0]

  const toggle = (m: 'tool' | 'color' | 'width') =>
    setOpenMenu((prev) => (prev === m ? null : m))
  // Wahl treffen und Menü schließen (ein Klick-zum-Aufklappen + ein Klick-zur-Wahl).
  const choose = (fn: () => void) => {
    fn()
    setOpenMenu(null)
  }

  const actionBtn =
    'bg-surface-2 border-border text-text-muted hover:text-text flex h-7 w-7 items-center justify-center rounded border transition-colors disabled:opacity-30'

  return (
    <div
      ref={rootRef}
      className="bg-surface/95 border-border absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-card)] border px-2 py-1.5 shadow-lg backdrop-blur"
    >
      {/* Form: aktuelles Werkzeug, klappt die vier Werkzeuge auf. */}
      <ToolbarMenu
        open={openMenu === 'tool'}
        onToggle={() => toggle('tool')}
        title={`Werkzeug: ${currentTool.label}`}
        trigger={currentTool.icon}
      >
        {tools.map((t, i) => (
          <Fragment key={t.key}>
            {/* Trennlinie zwischen Auswahl/Bewegen und den Zeichen-Werkzeugen. */}
            {i === 1 && <span className="bg-border mx-0.5 h-5 w-px" />}
            <button
              type="button"
              title={t.label}
              aria-pressed={tool === t.key}
              onClick={() => choose(() => onToolChange(t.key))}
              className={[
                'flex h-7 w-7 items-center justify-center rounded border transition-colors',
                tool === t.key
                  ? 'bg-accent border-accent text-white'
                  : 'bg-surface-2 border-border text-text hover:border-accent',
              ].join(' ')}
            >
              {t.icon}
            </button>
          </Fragment>
        ))}
      </ToolbarMenu>

      {/* Farbe: aktueller Farbpunkt, klappt die fünf Farben auf. */}
      <ToolbarMenu
        open={openMenu === 'color'}
        onToggle={() => toggle('color')}
        title={`Farbe: ${currentColor.label}`}
        trigger={
          <span
            className="border-border h-4 w-4 rounded-full border"
            style={{ background: currentColor.hex }}
          />
        }
      >
        {ANNOTATION_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            title={c.label}
            aria-pressed={color === c.key}
            onClick={() => choose(() => onColorChange(c.key))}
            className={[
              // Konstanter dezenter Rand grenzt auch helle Farben (Weiß) ab; der
              // aktive Zustand ist ein Akzent-Ring mit Offset — sichtbar auf jeder
              // Füllfarbe inkl. Weiß (ein weißer Rand verschwände auf Weiß).
              'border-border h-6 w-6 rounded-full border transition-transform',
              color === c.key
                ? 'ring-accent scale-110 ring-2 ring-offset-2 ring-offset-[color:var(--color-surface)]'
                : 'hover:scale-105',
            ].join(' ')}
            style={{ background: c.hex }}
          />
        ))}
      </ToolbarMenu>

      {/* Strichstärke: aktuelle Stufe, klappt Dünn/Mittel/Dick auf. Gilt für neue
          Formen; mit Auswahl ändert sie die ausgewählten. */}
      <ToolbarMenu
        open={openMenu === 'width'}
        onToggle={() => toggle('width')}
        title={`Strichstärke: ${currentWidth.label}`}
        trigger={<WidthBar k={currentWidth.key} />}
      >
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w.key}
            type="button"
            title={`Strichstärke: ${w.label}`}
            aria-pressed={width === w.px}
            onClick={() => choose(() => onWidthChange(w.px))}
            className={[
              'flex h-7 w-7 items-center justify-center rounded border transition-colors',
              width === w.px
                ? 'bg-accent border-accent text-white'
                : 'bg-surface-2 border-border text-text hover:border-accent',
            ].join(' ')}
          >
            <WidthBar k={w.key} />
          </button>
        ))}
      </ToolbarMenu>

      <span className="bg-border h-5 w-px" />

      {/* Direkte Aktionen — bewusst NICHT hinter einem Aufklapp-Schritt. */}
      <button
        type="button"
        onClick={onSelectAll}
        disabled={!canSelectAll}
        title="Alle Markierungen auswählen"
        aria-label="Alle Markierungen auswählen"
        className={actionBtn}
      >
        <SelectAllIcon />
      </button>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title={canUndo ? 'Rückgängig (Strg+Z)' : 'Nichts rückgängig zu machen'}
        aria-label="Rückgängig"
        className={actionBtn}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title={canRedo ? 'Wiederherstellen (Strg+Y)' : 'Nichts wiederherzustellen'}
        aria-label="Wiederherstellen"
        className={actionBtn}
      >
        <RedoIcon />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={!canDelete}
        title="Ausgewählte Markierung(en) löschen (Entf)"
        className="bg-surface-2 border-border text-text-muted hover:text-danger flex h-7 w-7 items-center justify-center rounded border transition-colors disabled:opacity-30"
      >
        <TrashIcon />
      </button>

      <span className="bg-border h-5 w-px" />
      <button
        type="button"
        onClick={onExit}
        title="Zeichnen-Modus verlassen (Esc)"
        aria-label="Zeichnen-Modus verlassen"
        className="text-text-muted hover:text-text flex h-7 w-7 items-center justify-center rounded transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.12 9.12 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function CursorIcon() {
  // Klassischer Auswahl-Cursor (Pfeilzeiger) — Werkzeug „Auswählen / Bewegen".
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round">
      <path d="M5 3l6.5 16 2.2-6.3L20 10.5 5 3z" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="19" x2="19" y2="5" />
      <polyline points="11 5 19 5 19 13" />
    </svg>
  )
}

function CircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
    </svg>
  )
}

function RectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  )
}

function SelectAllIcon() {
  // Gestrichelter Auswahlrahmen mit kleinem Inhalt — „alles markieren".
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
      <rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
    </svg>
  )
}

function RedoIcon() {
  // Spiegelbild des UndoIcon (Pfeil nach rechts statt links).
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h1" />
    </svg>
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
