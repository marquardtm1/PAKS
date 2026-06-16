/**
 * Helfer für Bild-Annotationen (Backlog #17). Reine Daten/Geometrie, keine UI —
 * damit Lightbox und Annotation-Layer dieselbe Quelle teilen und es testbar bleibt.
 *
 * Koordinaten sind durchweg **0..1, relativ zum Bild** (siehe Annotation in
 * types.ts). Das Rendern skaliert sie erst in die natürlichen Bildmaße, damit
 * die Abbildung viewBox→Bildbox uniform bleibt (kein Verzerren).
 */
import type { Annotation, AnnotationColor } from '@/lib/types'

/** Die wenigen festen Auswahlfarben, in Reihenfolge der Werkzeugleiste. */
export const ANNOTATION_COLORS: {
  key: AnnotationColor
  hex: string
  label: string
}[] = [
  { key: 'red', hex: '#ef4444', label: 'Rot' },
  { key: 'yellow', hex: '#eab308', label: 'Gelb' },
  { key: 'green', hex: '#22c55e', label: 'Grün' },
  { key: 'blue', hex: '#3b82f6', label: 'Blau' },
  { key: 'white', hex: '#ffffff', label: 'Weiß' },
]

/** Hex-Wert einer Annotations-Farbe (Fallback Rot). */
export function colorHex(c: AnnotationColor): string {
  return ANNOTATION_COLORS.find((x) => x.key === c)?.hex ?? '#ef4444'
}

/**
 * Wählbare Strichstärken als ZIEL-Bildschirmstärke in CSS-Pixeln (siehe
 * Annotation.strokeWidth). Der Strich wird beim Rendern an die DARGESTELLTE
 * Bildgröße angelegt (nicht an die native Auflösung), damit „Dünn/Mittel/Dick"
 * auf jedem Bild gleich dick wirken. Werte grob so gewählt, dass sie auf einem
 * bühnenfüllenden Bild den früheren Bruchteil-Presets entsprechen (kleiner
 * Sprung für Normalfälle).
 */
export const STROKE_WIDTHS: {
  key: 'thin' | 'medium' | 'thick'
  px: number
  label: string
}[] = [
  { key: 'thin', px: 1.8, label: 'Dünn' },
  { key: 'medium', px: 3, label: 'Mittel' },
  { key: 'thick', px: 5, label: 'Dick' },
]

/** Default-Strichstärke (CSS-px) für NEUE Annotationen (dünn). */
export const DEFAULT_STROKE_PX = STROKE_WIDTHS[0].px

/**
 * Frühere Bruchteil-Presets (Anteil der langen Bildkante), wie sie KURZZEITIG
 * gespeichert wurden, bevor auf CSS-px umgestellt wurde. Nur zum Zurückmappen
 * solcher Alt-Werte auf die heutigen px-Stufen.
 */
const LEGACY_FRAC_PRESETS: { frac: number; px: number }[] = [
  { frac: 0.0022, px: STROKE_WIDTHS[0].px },
  { frac: 0.0036, px: STROKE_WIDTHS[1].px },
  { frac: 0.0052, px: STROKE_WIDTHS[2].px },
]

/**
 * Gespeicherte Strichstärke einer Annotation als ZIEL-px auflösen.
 *
 * Die Bedeutung des Feldes hat sich geändert (Bruchteil → CSS-px); die Wert-
 * bereiche überschneiden sich NICHT (Bruchteile ≤ ~0,0052, px ≥ ~1,8), daher
 * lässt sich der Alt-Wert an der Größenordnung erkennen — keine Datenmigration.
 *  - undefined: vor dem Pro-Annotation-Width-Feature gezeichnet (alter fixer
 *    Default 0,005 ≈ „Dick") → Dick, damit sie ihrem alten Aussehen treu bleiben.
 *  - < 1: alter Bruchteil-Preset → auf die nächstgelegene heutige px-Stufe.
 *  - ≥ 1: bereits px → unverändert.
 */
export function resolveStrokePx(stored?: number): number {
  if (stored == null) return STROKE_WIDTHS[2].px
  if (stored < 1) {
    let best = LEGACY_FRAC_PRESETS[0]
    let bestDist = Infinity
    for (const p of LEGACY_FRAC_PRESETS) {
      const d = Math.abs(p.frac - stored)
      if (d < bestDist) {
        bestDist = d
        best = p
      }
    }
    return best.px
  }
  return stored
}

/** Ob eine Annotation ein nicht-leeres Label trägt. */
export function hasLabel(a: Annotation): boolean {
  return !!a.label && a.label.trim() !== ''
}

/**
 * Sinntragender Anker einer Annotation (normiert 0..1) — für die Position des
 * Label-Eingabefelds und des Nummern-Badges. Pfeil → Schaft-Ende (Start `x1,y1`,
 * damit die Spitze/der Befund frei bleibt); Kreis/Rechteck → obere rechte Ecke.
 */
export function annotationAnchor(a: Annotation): { x: number; y: number } {
  if (a.type === 'arrow') return { x: a.x1, y: a.y1 }
  return { x: a.x + a.w, y: a.y }
}

/**
 * Index pro BESCHRIFTETER Annotation für die eindeutige Zuordnung Bild ↔ Liste.
 * Beschriftete Annotationen werden nach Form+Farbe (`type:color`) in Array-/
 * Erstellreihenfolge gruppiert: kommt eine Kombination nur einmal vor → `null`
 * (kein Index, im Bild keine Nummer); ab zwei → fortlaufend `1,2,3 …`.
 * Unbeschriftete erscheinen NICHT in der Map.
 */
export function computeAnnotationIndices(
  annotations: Annotation[],
): Map<string, number | null> {
  const groups = new Map<string, Annotation[]>()
  for (const a of annotations) {
    if (!hasLabel(a)) continue
    const key = `${a.type}:${a.color}`
    const list = groups.get(key)
    if (list) list.push(a)
    else groups.set(key, [a])
  }
  const result = new Map<string, number | null>()
  for (const list of groups.values()) {
    if (list.length <= 1) result.set(list[0].id, null)
    else list.forEach((a, i) => result.set(a.id, i + 1))
  }
  return result
}

/** Lesbare Schriftfarbe AUF der Annotationsfarbe (für die Badge-Ziffer). */
export function contrastInk(c: AnnotationColor): string {
  return c === 'white' || c === 'yellow' ? '#0d1117' : '#ffffff'
}

/** Auf [0,1] begrenzen — Annotationen bleiben innerhalb des Bildes. */
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * Aus zwei (normierten) Eckpunkten eine fertige Annotation bauen. Für arrow ist
 * (a)→(b) die Richtung; für circle/rect wird die Box normalisiert (positive w,h).
 * Gibt null zurück, wenn die Geste zu winzig war (versehentlicher Klick).
 */
export function buildAnnotation(
  type: Annotation['type'],
  color: AnnotationColor,
  strokeWidth: number,
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
): Annotation | null {
  const ax = clamp01(a.x)
  const ay = clamp01(a.y)
  const bx = clamp01(b.x)
  const by = clamp01(b.y)
  // Mindestgröße, damit ein reiner Klick keine 0-Form anlegt.
  if (Math.abs(bx - ax) < 0.01 && Math.abs(by - ay) < 0.01) return null
  if (type === 'arrow') {
    return { id, type, color, strokeWidth, x1: ax, y1: ay, x2: bx, y2: by }
  }
  return {
    id,
    type,
    color,
    strokeWidth,
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  }
}
