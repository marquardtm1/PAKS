/**
 * Duplikat-Erkennung, Stufe 1: bitweise identische Bilder.
 *
 * Bilder liegen als Data-URL (base64) am Fall. Zwei bitweise identische Bilder
 * ergeben denselben Data-URL-String (gleicher MIME-Prefix + gleiche base64),
 * also reicht ein Hash über den String, um exakte Dubletten zu finden — kein
 * Dekodieren nötig. Das deckt den häufigen Fall ab: dieselbe Datei versehentlich
 * mehrfach importiert/eingefügt.
 *
 * Bewusst NICHT hier: ähnliche/fast gleiche Bilder (andere Auflösung, Ausschnitt,
 * Kompression) — das wäre perceptual hashing (Stufe 2, mit Schwellwert/Graubereich).
 */
import type { Case } from '@/lib/types'

export interface DuplicateGroup {
  /** SHA-256 der Bilddaten (Hex) — gemeinsam für alle Fälle der Gruppe. */
  hash: string
  /** Mindestens zwei Fälle mit identischen Bilddaten, in Bestandsreihenfolge. */
  cases: Case[]
}

/** SHA-256 eines Strings als Hex. Web Crypto ist in Chromium (auch file://) da. */
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Findet Gruppen bitweise identischer Bilder im Bestand. Reine Notizen (ohne
 * Bild) werden ignoriert. Ergebnis: nur echte Gruppen (>= 2 Fälle), die
 * größten zuerst, damit die lohnendsten Aufräum-Fälle oben stehen.
 */
export async function findDuplicateGroups(
  cases: Case[],
): Promise<DuplicateGroup[]> {
  const withImage = cases.filter((c): c is Case & { image: string } => !!c.image)
  const hashes = await Promise.all(withImage.map((c) => sha256Hex(c.image)))

  const byHash = new Map<string, Case[]>()
  withImage.forEach((c, i) => {
    const list = byHash.get(hashes[i])
    if (list) list.push(c)
    else byHash.set(hashes[i], [c])
  })

  return Array.from(byHash.entries())
    .filter(([, group]) => group.length >= 2)
    .map(([hash, group]) => ({ hash, cases: group }))
    .sort((a, b) => b.cases.length - a.cases.length)
}

/** Anzahl zugewiesener Tags (alle Gruppen-Werte + freie Tags). */
export function tagCount(c: Case): number {
  let n = c.freeTags.length
  for (const values of Object.values(c.groupValues)) n += values.length
  return n
}

const hasNote = (c: Case): boolean => c.notes.trim() !== ''

/** Datum für den Tie-Break: echtes Dateidatum, sonst Anlagezeit (älter = kleiner). */
const ageKey = (c: Case): number => c.fileModified ?? c.created

/** Alle Tag-Labels eines Falls (Gruppen-Werte + freie Tags) — für Verlust-Anzeige. */
function tagLabels(c: Case): string[] {
  const labels = [...c.freeTags]
  for (const values of Object.values(c.groupValues)) labels.push(...values)
  return labels
}

/**
 * „Bestpflege"-Reihenfolge: meiste Tags zuerst, dann mit Notiz, bei Gleichstand
 * der mit dem älteren Datum. Liefert den Default-Behalten-Fall einer Gruppe.
 */
export function defaultKeepId(group: DuplicateGroup): string {
  return [...group.cases].sort((a, b) => {
    const ta = tagCount(a)
    const tb = tagCount(b)
    if (ta !== tb) return tb - ta
    const na = hasNote(a) ? 1 : 0
    const nb = hasNote(b) ? 1 : 0
    if (na !== nb) return nb - na
    return ageKey(a) - ageKey(b)
  })[0].id
}

/** Was beim Löschen verloren ginge, wenn `keep` behalten und `others` gelöscht werden. */
export interface MetadataLoss {
  /** Tag-Labels, die nur die zu löschenden Fälle tragen. */
  tags: string[]
  /** true, wenn ein zu löschender Fall eine Notiz hat, die der Behaltene nicht enthält. */
  notes: boolean
}

export function metadataLoss(keep: Case, others: Case[]): MetadataLoss {
  const keepTags = new Set(tagLabels(keep))
  const lostTags = new Set<string>()
  let notes = false
  for (const o of others) {
    for (const t of tagLabels(o)) if (!keepTags.has(t)) lostTags.add(t)
    const note = o.notes.trim()
    if (note && !keep.notes.includes(note)) notes = true
  }
  return { tags: Array.from(lostTags), notes }
}

const hasLoss = (loss: MetadataLoss): boolean => loss.tags.length > 0 || loss.notes

/**
 * Vereinigt Tags + Notizen der `others` in `keep`: Gruppen-Werte und freie Tags
 * werden vereinigt (keine Dubletten), Notizen aneinandergehängt (durch Leerzeile
 * getrennt, identischer Text nicht doppelt). Überschreibt nichts am Behaltenen,
 * nur Ergänzungen. `updated` wird aufgefrischt.
 */
export function mergeInto(keep: Case, others: Case[]): Case {
  const groupValues: Record<string, string[]> = {}
  for (const [gid, vals] of Object.entries(keep.groupValues)) {
    groupValues[gid] = [...vals]
  }
  const freeTags = [...keep.freeTags]
  const noteParts = keep.notes.trim() ? [keep.notes.trim()] : []

  for (const o of others) {
    for (const [gid, vals] of Object.entries(o.groupValues)) {
      const target = groupValues[gid] ?? (groupValues[gid] = [])
      for (const v of vals) if (!target.includes(v)) target.push(v)
    }
    for (const t of o.freeTags) if (!freeTags.includes(t)) freeTags.push(t)
    const note = o.notes.trim()
    // Übernommene Notiz mit Quell-Titel als Präfix versehen, damit später
    // nachvollziehbar bleibt, von welchem Duplikat der Teil stammt.
    if (note && !noteParts.some((p) => p.includes(note))) {
      const source = o.title.trim() || '(ohne Titel)'
      noteParts.push(`[aus „${source}"]\n${note}`)
    }
  }

  return { ...keep, groupValues, freeTags, notes: noteParts.join('\n\n'), updated: Date.now() }
}

export { hasNote, hasLoss }
