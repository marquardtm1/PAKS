/**
 * Das Snapshot-Format ist die „source of truth"-Struktur von PAKS.
 *
 * Ein Snapshot ist der vollständige App-Zustand (Fälle inkl. base64-Bilder,
 * Tag-Gruppen, Einstellungen) als ein serialisierbares Objekt. ALLE Persistenz-
 * Wege teilen sich dieses Format:
 *   - Weg A: Export/Import als JSON-Datei (Fallback, universell)
 *   - Weg B: lebende Datendatei via File System Access API (später, primär)
 *   - Cache: IndexedDB (Phase 1)
 *
 * Weil Format und Logik hier zentral liegen, ist der spätere Wechsel des
 * Persistenz-Adapters kein Umbau — nur eine andere Quelle/Senke desselben
 * Snapshots. serialize()/deserialize() sind die einzige Stelle, an der die
 * On-Disk-Repräsentation entsteht bzw. validiert/migriert wird.
 */
import type { Case, Settings, TagGroup } from '@/lib/types'

/** Bei jeder Brechung des On-Disk-Formats erhöhen und Migration in migrate() ergänzen. */
export const CURRENT_SCHEMA_VERSION = 1

/** Erkennungsmarke in der Datei, um fremde JSONs früh abzuweisen. */
export const SNAPSHOT_MAGIC = 'paks.snapshot'

export interface Snapshot {
  /** Konstante Marke zur Format-Erkennung. */
  magic: typeof SNAPSHOT_MAGIC
  schemaVersion: number
  /** ISO-Zeitstempel des letzten Schreibens (informativ). */
  savedAt: string
  cases: Case[]
  tagGroups: TagGroup[]
  settings: Settings
}

/** Default-Breite der Seitenleiste in px. */
export const DEFAULT_SIDEBAR_WIDTH = 220
/** Default-Höhe der unteren Befehlszone (Hinzufügen + Werkzeuge) in px. */
export const DEFAULT_SIDEBAR_BOTTOM_HEIGHT = 232

export const DEFAULT_SETTINGS: Settings = {
  disclaimerAccepted: false,
  startupNoticeDismissed: false,
  theme: 'light',
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  sidebarBottomHeight: DEFAULT_SIDEBAR_BOTTOM_HEIGHT,
  filenameSplitEnabled: false,
  filenameSeparator: '-',
  notesExpandedByDefault: true,
  sortKey: 'date',
  sortDir: 'desc',
  searchCaseSensitive: false,
  slideshowIntervalSec: 5,
  slideshowOrder: 'grid',
  slideshowMetaHidden: false,
  slideshowAuto: false,
  slideshowAutoDrill: true,
}

/** Leerer, gültiger Snapshot — Startpunkt vor dem ersten Laden/Seed. */
export function createEmptySnapshot(): Snapshot {
  return {
    magic: SNAPSHOT_MAGIC,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    cases: [],
    tagGroups: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

/** Fehler beim Lesen/Parsen einer Datendatei — von der UI abfangbar. */
export class SnapshotFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SnapshotFormatError'
  }
}

/** Snapshot → JSON-String (für Datei/Cache). Frischer savedAt-Zeitstempel. */
export function serialize(snapshot: Snapshot): string {
  const out: Snapshot = {
    ...snapshot,
    magic: SNAPSHOT_MAGIC,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
  }
  return JSON.stringify(out)
}

/**
 * JSON-String → validierter, auf die aktuelle Version migrierter Snapshot.
 * Wirft SnapshotFormatError bei fremden/kaputten Daten.
 */
export function deserialize(raw: string): Snapshot {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new SnapshotFormatError('Datei ist kein gültiges JSON.')
  }
  return fromParsed(parsed)
}

/** Wie deserialize(), aber für bereits geparste Objekte (z. B. aus IndexedDB). */
export function fromParsed(parsed: unknown): Snapshot {
  if (!isRecord(parsed) || parsed.magic !== SNAPSHOT_MAGIC) {
    throw new SnapshotFormatError('Keine PAKS-Datendatei (Erkennungsmarke fehlt).')
  }
  const version =
    typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new SnapshotFormatError(
      `Datei stammt aus einer neueren PAKS-Version (Format ${version}). Bitte App aktualisieren.`,
    )
  }
  return migrate(parsed, version)
}

/**
 * Hebt einen geparsten Snapshot auf CURRENT_SCHEMA_VERSION.
 * Phase 1 kennt nur Version 1 — künftige Brüche hier als sequentielle Schritte
 * ergänzen (v1→v2, v2→v3 …).
 */
function migrate(data: Record<string, unknown>, _fromVersion: number): Snapshot {
  // (Noch keine Migrationsschritte — Version 1 ist die erste.)
  const base = createEmptySnapshot()
  return {
    ...base,
    cases: Array.isArray(data.cases) ? (data.cases as Case[]) : [],
    tagGroups: Array.isArray(data.tagGroups)
      ? (data.tagGroups as TagGroup[])
      : [],
    settings: isRecord(data.settings)
      ? { ...DEFAULT_SETTINGS, ...(data.settings as Partial<Settings>) }
      : { ...DEFAULT_SETTINGS },
    savedAt:
      typeof data.savedAt === 'string' ? data.savedAt : base.savedAt,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
