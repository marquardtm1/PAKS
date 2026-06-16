import { useLayoutEffect, useRef, useState } from 'react'
import type { Annotation, AnnotationColor } from '@/lib/types'
import { uid } from '@/lib/id'
import {
  buildAnnotation,
  clamp01,
  colorHex,
  resolveStrokePx,
  ANNOTATION_COLORS,
} from '@/lib/annotations'

/** Werkzeug im Zeichen-Modus. */
export type AnnotationTool = 'arrow' | 'circle' | 'rect'

/**
 * SVG-Overlay über dem Bild: rendert die Annotationen und — im Zeichen-Modus —
 * das Anlegen neuer sowie das Auswählen bestehender Formen.
 *
 * Liegt INNERHALB des transformierten Stage-Wrappers (zoomt/pant also mit dem
 * Bild mit). Die viewBox entspricht den natürlichen Bildmaßen; weil der Wrapper
 * das `object-contain`-Bild eng umschließt, hat seine Box dasselbe Seiten-
 * verhältnis → die Abbildung viewBox→Box ist uniform (Kreise bleiben rund,
 * Strichstärken gleichmäßig, Standard-Pfeilköpfe funktionieren).
 *
 * Pointer-Koordinaten werden über das gemessene on-screen-Rect normiert; das
 * spiegelt Zoom/Pan wider, daher funktioniert Zeichnen auf jeder Zoomstufe.
 */
export function AnnotationLayer({
  annotations,
  visible,
  naturalW,
  naturalH,
  zoomScale,
  drawMode,
  tool,
  color,
  strokeWidth,
  selectedIds,
  onSelect,
  onCreate,
  className,
}: {
  annotations: Annotation[]
  visible: boolean
  naturalW: number
  naturalH: number
  /** Aktuelle Zoomstufe des Stage-Wrappers — der Strich wird dadurch geteilt,
   *  damit er beim Zoomen optisch konstant bleibt (non-scaling-stroke-Effekt). */
  zoomScale: number
  drawMode: boolean
  tool: AnnotationTool
  color: AnnotationColor
  /** Ziel-Strichstärke in CSS-px für NEU gezeichnete Formen. */
  strokeWidth: number
  /** IDs der aktuell ausgewählten Formen (Mehrfachauswahl möglich). */
  selectedIds: string[]
  onSelect: (id: string | null) => void
  onCreate: (a: Annotation) => void
  /** Wird auf das <svg> gelegt — vom Aufrufer zum Stapeln über dem Bild genutzt. */
  className?: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<{ a: Point; b: Point } | null>(null)
  // Dargestellte (un-gezoomte) lange Kante des Overlays in CSS-px. Gemessen über
  // die Layout-Box (clientWidth/contentRect) — die ist vom Zoom-Transform des
  // Stage-Wrappers UNberührt, also genau die Bildschirmgröße bei Zoom 1. Daran
  // wird die px-Ziel-Strichstärke angelegt (Auflösungs-unabhängig); die Zoomstufe
  // wird separat herausgerechnet. useLayoutEffect: synchron vor dem Paint messen,
  // damit der erste Frame schon die richtige Stärke hat (kein Aufblitzen).
  const [displayedLong, setDisplayedLong] = useState(0)
  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const apply = (w: number, h: number) => {
      const long = Math.max(w, h)
      if (long > 0) setDisplayedLong(long)
    }
    apply(el.clientWidth, el.clientHeight)
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) apply(r.width, r.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [naturalW, naturalH, visible, drawMode])

  if (!naturalW || !naturalH) return null
  // Im Zeichen-Modus immer rendern; sonst nur, wenn der Anzeige-Schalter an ist.
  if (!visible && !drawMode) return null

  // Ziel-px → SVG-Nutzereinheiten: an die dargestellte Größe anlegen und die
  // Zoomstufe herausrechnen. Eingesetzt ergibt die on-screen-Stärke exakt die
  // Ziel-px — konstant über native Auflösung UND Zoom. markerUnits="strokeWidth"
  // skaliert den Pfeilkopf mit → auch er bleibt optisch konstant.
  const maxNatural = Math.max(naturalW, naturalH)
  const swUser = (px: number) =>
    displayedLong > 0 ? (px * maxNatural) / (displayedLong * (zoomScale || 1)) : 0

  function toNorm(e: React.PointerEvent): Point {
    const r = svgRef.current!.getBoundingClientRect()
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    }
  }

  function onBgPointerDown(e: React.PointerEvent) {
    if (!drawMode || e.button !== 0) return
    // Auf leere Fläche → neue Form beginnen (Klick auf eine Form wird vom Shape-
    // Handler abgefangen und selektiert stattdessen).
    e.preventDefault()
    onSelect(null)
    const p = toNorm(e)
    setDraft({ a: p, b: p })
    svgRef.current?.setPointerCapture(e.pointerId)
  }
  function onBgPointerMove(e: React.PointerEvent) {
    if (!draft) return
    const p = toNorm(e)
    setDraft((d) => (d ? { a: d.a, b: p } : d))
  }
  function onBgPointerUp(e: React.PointerEvent) {
    if (!draft) return
    try {
      svgRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      // Capture kann bereits verloren sein.
    }
    const built = buildAnnotation(tool, color, strokeWidth, uid(), draft.a, draft.b)
    setDraft(null)
    if (built) onCreate(built)
  }

  const draftAnn = draft ? draftToAnnotation(draft, tool, color, strokeWidth) : null

  return (
    <svg
      ref={svgRef}
      width={naturalW}
      height={naturalH}
      viewBox={`0 0 ${naturalW} ${naturalH}`}
      preserveAspectRatio="none"
      className={`max-h-full max-w-full ${className ?? ''}`}
      style={{
        pointerEvents: drawMode ? 'auto' : 'none',
        cursor: drawMode ? 'crosshair' : 'default',
        touchAction: 'none',
        // Verborgen-Zustand: ausblenden, aber im Zeichen-Modus gedimmt zeigen
        // (Layer rendert dann weiter, siehe Render-Guard oben).
        opacity: visible ? 1 : drawMode ? 1 : 0,
      }}
      onPointerDown={onBgPointerDown}
      onPointerMove={onBgPointerMove}
      onPointerUp={onBgPointerUp}
      onPointerCancel={onBgPointerUp}
    >
      <defs>
        {ANNOTATION_COLORS.map((c) => (
          <marker
            key={c.key}
            id={`annhead-${c.key}`}
            markerWidth="4"
            markerHeight="4"
            refX="3"
            refY="2"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L4,2 L0,4 Z" fill={c.hex} />
          </marker>
        ))}
      </defs>

      {/* Verborgen-aber-im-Zeichen-Modus: gedimmt zeigen, damit man weiß, wo schon
          markiert ist, ohne den „verborgen"-Zustand zu verlieren. */}
      <g opacity={!visible && drawMode ? 0.35 : 1}>
        {annotations.map((a) => (
          <Shape
            key={a.id}
            ann={a}
            w={naturalW}
            h={naturalH}
            sw={swUser(resolveStrokePx(a.strokeWidth))}
            selected={selectedIds.includes(a.id)}
            interactive={drawMode}
            onSelect={onSelect}
          />
        ))}
      </g>

      {draftAnn && (
        <Shape
          ann={draftAnn}
          w={naturalW}
          h={naturalH}
          sw={swUser(resolveStrokePx(draftAnn.strokeWidth))}
          selected={false}
          interactive={false}
          onSelect={onSelect}
        />
      )}
    </svg>
  )
}

interface Point {
  x: number
  y: number
}

/** Draft (zwei Rohpunkte) → vorläufige Annotation für die Live-Vorschau. */
function draftToAnnotation(
  draft: { a: Point; b: Point },
  tool: AnnotationTool,
  color: AnnotationColor,
  strokeWidth: number,
): Annotation {
  const { a, b } = draft
  if (tool === 'arrow') {
    return {
      id: '__draft',
      type: 'arrow',
      color,
      strokeWidth,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
    }
  }
  return {
    id: '__draft',
    type: tool,
    color,
    strokeWidth,
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

/** Eine Form (sichtbarer Strich + im Zeichen-Modus eine breite, unsichtbare
 *  Trefferfläche zum Anklicken). Auswahl bekommt einen weißen Halo. */
function Shape({
  ann,
  w,
  h,
  sw,
  selected,
  interactive,
  onSelect,
}: {
  ann: Annotation
  w: number
  h: number
  sw: number
  selected: boolean
  interactive: boolean
  onSelect: (id: string | null) => void
}) {
  const hex = colorHex(ann.color)
  const hitProps = interactive
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          e.stopPropagation()
          onSelect(ann.id)
        },
        style: { cursor: 'pointer' as const },
      }
    : {}

  // Geometrie in Bild-Pixel (uniforme Abbildung, siehe Layer-Kommentar).
  if (ann.type === 'arrow') {
    const x1 = ann.x1 * w
    const y1 = ann.y1 * h
    const x2 = ann.x2 * w
    const y2 = ann.y2 * h
    return (
      <g>
        {selected && (
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#ffffff"
            strokeWidth={sw * 2.2}
            strokeLinecap="round"
            opacity={0.85}
          />
        )}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={hex}
          strokeWidth={sw}
          strokeLinecap="round"
          markerEnd={`url(#annhead-${ann.color})`}
        />
        {interactive && (
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="transparent"
            strokeWidth={sw * 6}
            strokeLinecap="round"
            {...hitProps}
          />
        )}
      </g>
    )
  }

  const x = ann.x * w
  const y = ann.y * h
  const bw = ann.w * w
  const bh = ann.h * h

  if (ann.type === 'rect') {
    return (
      <g>
        {selected && (
          <rect
            x={x}
            y={y}
            width={bw}
            height={bh}
            fill="none"
            stroke="#ffffff"
            strokeWidth={sw * 2.2}
            opacity={0.85}
          />
        )}
        <rect x={x} y={y} width={bw} height={bh} fill="none" stroke={hex} strokeWidth={sw} />
        {interactive && (
          <rect
            x={x}
            y={y}
            width={bw}
            height={bh}
            fill="transparent"
            stroke="transparent"
            strokeWidth={sw * 6}
            {...hitProps}
          />
        )}
      </g>
    )
  }

  // circle → Ellipse, die die Box füllt
  const cx = x + bw / 2
  const cy = y + bh / 2
  const rx = bw / 2
  const ry = bh / 2
  return (
    <g>
      {selected && (
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke="#ffffff"
          strokeWidth={sw * 2.2}
          opacity={0.85}
        />
      )}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={hex} strokeWidth={sw} />
      {interactive && (
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="transparent"
          stroke="transparent"
          strokeWidth={sw * 6}
          {...hitProps}
        />
      )}
    </g>
  )
}
