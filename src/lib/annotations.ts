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
]

/** Hex-Wert einer Annotations-Farbe (Fallback Rot). */
export function colorHex(c: AnnotationColor): string {
  return ANNOTATION_COLORS.find((x) => x.key === c)?.hex ?? '#ef4444'
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
    return { id, type, color, x1: ax, y1: ay, x2: bx, y2: by }
  }
  return {
    id,
    type,
    color,
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  }
}
