/**
 * Hilfsfunktionen für Video-Referenz-Fälle (Backlog #12).
 *
 * Verweis-Modell, KEIN Einbetten: PAKS speichert nur Pfad + Thumbnail, nie das
 * Video. Diese Datei kapselt die zwei kniffligen Browser-Mechanismen:
 *  - extractVideoThumbnail: Standbild aus einer lokalen Videodatei (verstecktes
 *    <video> + Canvas) — Best-Effort, scheitert sauber bei nicht dekodierbaren
 *    Formaten (Aufrufer fällt dann auf „manuell wählen" zurück).
 *  - toFileUrl: Pfad → file://-URL fürs Best-Effort-„Abspielen" (Chromium blockt
 *    file:// von http/localhost meist — der verlässliche Weg bleibt „Kopieren").
 */

/** Wartet auf ein Medien-Event ODER scheitert (error/Timeout). */
function onceOrFail(
  el: HTMLMediaElement,
  event: 'loadedmetadata' | 'seeked',
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      el.removeEventListener(event, onOk)
      el.removeEventListener('error', onErr)
      clearTimeout(timer)
    }
    const onOk = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const onErr = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('Video konnte nicht gelesen werden (Format/Codec?).'))
    }
    const timer = setTimeout(onErr, timeoutMs)
    el.addEventListener(event, onOk)
    el.addEventListener('error', onErr)
  })
}

/**
 * Kandidaten-Zeitpunkte (Anteil der Dauer): bewusst NICHT bei 0 — viele Videos
 * haben schwarzen Vorlauf/Fade-in. Wir greifen ~10 % zuerst und rücken bei zu
 * dunklem Frame weiter nach hinten (25 %, 50 %, 75 %).
 */
const SEEK_FRACTIONS = [0.1, 0.25, 0.5, 0.75]
/** Mittlere Helligkeit (0–255), ab der ein Frame als „hat Bildinhalt" gilt. */
const MIN_LUMA = 16
/** Darunter ist der Frame praktisch komplett schwarz → unbrauchbar. */
const BLACK_FLOOR = 6

/** Mittlere Helligkeit der Canvas (Luma), über jeden 16. Pixel abgetastet. */
function meanLuma(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const { data } = ctx.getImageData(0, 0, width, height)
  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4 * 16) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    count++
  }
  return count > 0 ? sum / count : 0
}

/**
 * Extrahiert ein Standbild aus einer lokalen Videodatei als JPEG-Data-URL.
 * Probiert mehrere Zeitpunkte und überspringt (nahezu) schwarze Frames
 * (schwarzer Vorlauf) — nimmt den ersten hellen Frame, sonst den hellsten
 * gefundenen. Wirft bei nicht dekodierbaren Formaten, Timeout oder wenn alle
 * Frames praktisch schwarz sind — der Aufrufer fällt dann auf „manuell" zurück.
 */
export async function extractVideoThumbnail(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  video.src = url
  // Offscreen einhängen statt display:none — manche Browser dekodieren sonst
  // keinen Frame, den drawImage lesen könnte.
  video.style.cssText =
    'position:fixed;left:-9999px;top:0;width:320px;height:auto;opacity:0;pointer-events:none'
  document.body.appendChild(video)
  try {
    await onceOrFail(video, 'loadedmetadata', 10_000)

    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) {
      throw new Error('Kein Frame mit Maßen verfügbar.')
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar.')

    const duration = video.duration
    // Bei gültiger Dauer mehrere Anteile; sonst ein einzelner früher Versuch.
    const targets =
      Number.isFinite(duration) && duration > 0
        ? SEEK_FRACTIONS.map((f) => Math.min(duration * f, duration - 0.05))
        : [0.1]

    let bestUrl = ''
    let bestLuma = -1
    for (const t of targets) {
      video.currentTime = Math.max(0, t)
      await onceOrFail(video, 'seeked', 10_000)
      ctx.drawImage(video, 0, 0, width, height)
      const luma = meanLuma(ctx, width, height)
      // Blob-URL einer lokalen Datei ist nicht cross-origin → toDataURL/getImageData
      // „tainten" nicht. JPEG hält das Thumbnail klein.
      if (luma >= MIN_LUMA) {
        return canvas.toDataURL('image/jpeg', 0.8)
      }
      if (luma > bestLuma) {
        bestLuma = luma
        bestUrl = canvas.toDataURL('image/jpeg', 0.8)
      }
    }
    // Kein heller Frame: den hellsten nehmen, sofern nicht praktisch schwarz.
    if (bestUrl && bestLuma >= BLACK_FLOOR) return bestUrl
    throw new Error('Nur (nahezu) schwarze Frames gefunden.')
  } finally {
    video.removeAttribute('src')
    video.load()
    document.body.removeChild(video)
    URL.revokeObjectURL(url)
  }
}

/**
 * Pfad säubern: umschließende Anführungszeichen entfernen. Windows' „Als Pfad
 * kopieren" liefert den Pfad mit doppelten Quotes ("C:\…\fall.mp4"), die sonst
 * im gespeicherten/kopierten Pfad landen und das Einfügen im Explorer brechen.
 */
export function normalizeVideoPath(path: string): string {
  let s = path.trim()
  while (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim()
  }
  return s
}

/**
 * Pfad → file://-URL. Backslashes zu Slashes, Windows-Laufwerk (C:/…) bekommt
 * den führenden Slash (file:///C:/…). Nur problematische Zeichen werden kodiert
 * (Slash/Doppelpunkt bleiben erhalten, damit die URL gültig bleibt).
 */
export function toFileUrl(path: string): string {
  let s = normalizeVideoPath(path).replace(/\\/g, '/')
  if (!s.startsWith('/')) s = '/' + s
  const encoded = s
    .replace(/%/g, '%25')
    .replace(/ /g, '%20')
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F')
  return 'file://' + encoded
}
