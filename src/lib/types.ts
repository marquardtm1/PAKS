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
  /**
   * Video-Fall, REFERENZIERT: absoluter Pfad zur externen Videodatei. Das Video
   * selbst liegt NICHT in PAKS — nur dieser Verweis plus ein Thumbnail (im
   * `image`-Feld). Alternative zum Einbetten für große Dateien. Browser-bedingt
   * manuell eingegeben; der Pfad bricht, wenn die Datei verschoben/umbenannt
   * wird oder auf einem anderen Rechner liegt. Schließt sich mit `videoData`
   * aus: ein Video-Fall ist entweder referenziert ODER eingebettet, nie beides.
   */
  videoPath?: string
  /**
   * Video-Fall, EINGEBETTET: Data-URL (base64) der Videodatei, in PAKS
   * gespeichert (genau wie `image`) und im integrierten Player direkt abspielbar.
   * Vergrößert Datendatei/Export deutlich (Größenwarnung beim Anlegen). Gesetzt
   * ⇒ eingebetteter Video-Fall; schließt sich mit `videoPath` aus.
   */
  videoData?: string
  /**
   * Ein-/ausblendbare Markierungen ÜBER dem Bild (Backlog #17) — Overlay-Vektor-
   * daten, NICHT ins Bild eingebrannt: jederzeit zeig-/verbergbar und editierbar,
   * Originalbild bleibt unberührt. Koordinaten 0..1 relativ zum Bild, damit sie
   * bei Zoom/Skalierung am Befund sitzen. Additiv & optional (fehlt = keine).
   */
  annotations?: Annotation[]
}

/** Feste Annotations-Farben (für unterschiedliche Bildkontraste). 'white' als
 *  Kontrastfarbe auf dunklen Bildbereichen, 'blue' als kräftige Kontrastfarbe auf
 *  hellen/grauen Flächen. Additiv — bestehende Annotationen bleiben gültig. */
export type AnnotationColor = 'red' | 'yellow' | 'green' | 'white' | 'blue'

interface AnnotationBase {
  id: string
  color: AnnotationColor
  /**
   * Ziel-Strichstärke in CSS-Pixeln (Bildschirmstärke). Das Rendern legt den
   * Strich an die DARGESTELLTE Bildgröße an (nicht an die native Auflösung) und
   * rechnet die Zoomstufe heraus → optisch konstant über Bilder UND Zoomstufen.
   * Pro Annotation gespeichert, damit eine spätere Default-Änderung bestehende
   * NICHT springen lässt. Additiv & optional; aufgelöst über resolveStrokePx()
   * (in annotations.ts), das auch ältere Bruchteil-Werte und Altbestand (fehlend)
   * verträglich auf px abbildet.
   */
  strokeWidth?: number
}

/**
 * Eine Bild-Markierung. Alle Koordinaten sind **0..1, relativ zum Bild** (0,0 =
 * linke obere Ecke, 1,1 = rechte untere). `arrow` als Start→End-Punkt (für den
 * Pfeilkopf), `circle`/`rect` als Bounding-Box (Kreis wird als Ellipse in die
 * Box gezeichnet). Box stets normalisiert (w,h ≥ 0).
 */
export type Annotation =
  | (AnnotationBase & {
      type: 'arrow'
      x1: number
      y1: number
      x2: number
      y2: number
    })
  | (AnnotationBase & {
      type: 'circle' | 'rect'
      x: number
      y: number
      w: number
      h: number
    })

export type Theme = 'dark' | 'light'

/** Sortierschlüssel des Hauptgrids. */
export type SortKey = 'title' | 'date'
/** Sortierrichtung. */
export type SortDir = 'asc' | 'desc'

/** Reihenfolge der Diashow: wie im Grid (aktuelle Sortierung) oder zufällig. */
export type SlideshowOrder = 'grid' | 'shuffle'

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

  // ── Diashow (gemerkte Modus-Wahl + Timer) ──────────────────────────────────
  /** Auto-Intervall in Sekunden (Bereich 2–30). */
  slideshowIntervalSec: number
  /** Reihenfolge: wie im Grid oder zufällig (Shuffle). */
  slideshowOrder: SlideshowOrder
  /** Metadaten beim Start verborgen (aktiver Abruf) statt sichtbar. */
  slideshowMetaHidden: boolean
  /** Zuletzt gewählter Auto-Modus (true = Auto-Weiterschalten, false = manuell). */
  slideshowAuto: boolean
  /**
   * Verhalten im Auto-Modus bei verborgenen Metadaten:
   *  - true (Aufdeck-Drill): Timer deckt erst auf, schaltet dann weiter
   *    (Bild → Intervall → Auflösung → Intervall → nächstes).
   *  - false (Durchblättern): Timer schaltet nur Bilder weiter, Aufdecken manuell.
   */
  slideshowAutoDrill: boolean
}
