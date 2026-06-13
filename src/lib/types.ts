/**
 * Domänen-Datenmodell von PAKS.
 *
 * Bewusste Entscheidungen:
 * - Tag-Gruppen sind von Anfang an konfigurierbar (Feature-Priorität 1).
 *   „Modalität" und „Region" sind nur Default-Gruppen, nicht hartkodiert.
 * - Bilder liegen als Data-URL (base64) direkt am Fall. Das hält das gebündelte
 *   Datei-Format (Snapshot) selbsttragend: eine Datei = alle Daten + Bilder,
 *   identisch für Weg A (Export) und Weg B (lebende Datei).
 */

/** Eine nutzerdefinierte Tag-Gruppe, z. B. „Modalität" (blau) mit Werten CT, MRT … */
export interface TagGroup {
  id: string
  name: string
  /** Hex-Farbe, z. B. "#2a7db8" — färbt Sidebar-Abschnitt und Tag-Chips. */
  colorHex: string
  /** Wenn true, sollte beim Anlegen eines Falls mindestens ein Wert gesetzt sein. */
  required: boolean
  /** Vordefinierte Werte zur Auswahl. Freitext-Werte bleiben zusätzlich möglich. */
  values: string[]
  /** Anzeige-/Priorisierungsreihenfolge in der Sidebar (kleiner = weiter oben). */
  order: number
}

/** Ein Fall: Bild + Metadaten, oder reine Notiz (ohne Bild). */
export interface Case {
  id: string
  title: string
  /** Beschreibung / Lernhinweis (durchsuchbar). */
  description: string
  /** Persönliche Notizen, visuell abgesetzt (goldgelb), durchsuchbar. */
  notes: string
  /** Data-URL (base64) des Bildes; null bei reinen Notizen. */
  image: string | null
  /**
   * Zugewiesene Tag-Gruppen-Werte: groupId → gewählte Werte.
   * Mehrwertig, damit ein Fall z. B. mehrere Regionen tragen kann.
   */
  groupValues: Record<string, string[]>
  /** Freie Tags ohne Gruppenzugehörigkeit. */
  freeTags: string[]
  /** Epoch-ms. */
  created: number
  updated: number
  /**
   * Echtes Datei-Datum (file.lastModified, epoch-ms) beim Import — erlaubt das
   * Sortieren nach dem tatsächlichen Dateidatum statt nur nach Import-Zeitpunkt.
   * Optional: reine Notizen und Altbestand ohne Datei haben keins (Fallback: created).
   */
  fileModified?: number
}

export type Theme = 'dark' | 'light'

/** Sortierschlüssel des Hauptgrids. */
export type SortKey = 'title' | 'date'
/** Sortierrichtung. */
export type SortDir = 'asc' | 'desc'

/** App-Einstellungen (klein; landen mit im Snapshot). */
export interface Settings {
  /** Datenschutz-/USB-Warnhinweis vom Nutzer bestätigt. */
  disclaimerAccepted: boolean
  /** Farbschema. Dark ist Default. */
  theme: Theme
  /** Breite der Seitenleiste in px (per Drag verstellbar). */
  sidebarWidth: number
  /**
   * Höhe der festen unteren Befehlszone (Hinzufügen + Werkzeuge) in px, per
   * Drag-Trennlinie zwischen Kategorien und Befehlszone verstellbar. Die
   * Einstellungs-Mini-Leiste (Zahnrad + Theme) liegt darunter und ist davon
   * unberührt.
   */
  sidebarBottomHeight: number
  /**
   * Beim Import lange Dateinamen in Titel + Notizen aufteilen (statt ganzer
   * Name → Titel). Greift einheitlich für Batch-Import und Einzel-Upload/Paste.
   */
  filenameSplitEnabled: boolean
  /** Trennzeichen für die Aufteilung des Dateinamens (Default „-"). */
  filenameSeparator: string
  /** Default-Klappstatus des Notizfelds in der Vollbild-Ansicht (auf-/zugeklappt). */
  notesExpandedByDefault: boolean
  /** Sortierschlüssel des Hauptgrids (Titel oder Datum). */
  sortKey: SortKey
  /** Sortierrichtung des Hauptgrids. */
  sortDir: SortDir
  /**
   * Wenn true, unterscheidet die Suche zusätzlich Groß-/Kleinschreibung
   * (Teilwortsuche bleibt). Default false = Schreibung egal (bisheriges Verhalten).
   */
  searchCaseSensitive: boolean
}
