# CLAUDE.md – PAKS

> **Dieses Projekt ist unabhängig von neurorad-strukturen.ch.**
> Kein gemeinsamer Code, kein gemeinsames Supabase, kein gemeinsames Deployment.
> Bei Unklarheiten: PAKS ist ein separates Produkt.

---

## Was ist PAKS?

**PAKS** = **P**ersonal **A**rchive & **K**nowledge **S**ystem. Der Name ist eine bewusste augenzwinkernde Verballhornung von **PACS** (Picture Archiving and Communication System, das klinische Bildsystem der Radiologie): klingt fast identisch, ist durch das K aber als eigenständiges, privates Gegenstück erkennbar. Botschaft: nicht das schwere Klinik-System für Patientendaten, sondern das eigene, leichte, lokale Bild- und Wissensarchiv. Das Wortspiel zündet im radiologischen Kontext sofort. UI-Wortmarke immer mit Auflösung führen („PAKS – Personal Archive & Knowledge System"), um Abgrenzung von der gleichnamigen Motorola-System-App und Gastro-App zu wahren.

Eine **lokal-first Web-App** für Radiologen zum Anlegen, Taggen und Wiederholen eigener Fallbilder (Screenshots). Kein Backend, kein Login, kein Cloud-Sync. Alle Daten bleiben im Browser (localStorage / IndexedDB).

Drei Use Cases:
1. **Spaced Repetition** – eigene Fälle aktiv wiederholen
2. **Persönliches Bildarchiv** – schneller Zugriff auf eigene Referenzbilder statt PACS-Suche
3. **Kuratierte Basisbibliothek** – vorkuratierte Normalbefunde / Radiopaedia-Material als Seed

---

## Tech Stack

- **Build-Tool:** Vite
- **Framework:** React (gewählt wegen Nähe zum Strukturen-App-Layout, das ebenfalls React ist, und wegen wachsender Interaktivität: Filter, Vergrößerung, Tag-Verwaltung, später Spaced Repetition)
- **Styling:** CSS custom properties / Tailwind (analog Strukturen-App, falls dort verwendet) — kein schweres UI-Framework
- **Storage:** Primär **File System Access API** (Weg B) — die App liest/schreibt fortlaufend in *eine gebündelte Datendatei* (Bilder als base64 + Metadaten), die der Nutzer beim Start auswählt. Diese Datei kann auf einem USB-Stick liegen → App läuft direkt vom Stick, jede Änderung landet sofort in der Datei, an jedem Rechner sofort aktuell, kein Export-Schritt nötig. Die lebende Datei *ist* zugleich Backup/Transfer-Datei: einfach wie jede Datei kopieren (Stick → PC, PC → PC). Einschränkung: File System Access API nur in Chromium-Browsern (Chrome, Edge), nicht Firefox/Safari.
  - **Fallback / universelles Fundament:** Export/Import als JSON-Datei (Weg A) bleibt immer vorhanden — für Firefox/Safari, für Backups und für Geräte ohne File System Access API. Manueller Export → Datei → Import.
  - **IndexedDB** als Cache/Arbeitsspeicher im Browser möglich, aber die Datendatei ist die „source of truth", nicht der Browser-Storage.
- **Deployment:** statische SPA, läuft lokal im Browser oder direkt vom USB-Stick (Chromium)
- **Kein Backend, keine API, keine Server-Datenbank, kein Auth** (Lite-Version)

> **Kein Cloud-Sync.** Bewusst ausgeschlossen wegen Datenschutz (Gesundheitsdaten). Geräte-Übertragung läuft ausschließlich über die kopierbare Datendatei (Weg B) bzw. Export/Import (Weg A) — beides ohne Server, volle Kontrolle beim Nutzer.

> **USB-Stick-Warnhinweis (in der App anzeigen):** Ein verlorener Stick mit Fallbildern ist ein reales Risiko. Nutzer ist verantwortlich, nur anonymisierte Screenshots (kein Patientenbezug) abzulegen.

> Hinweis: Der Prototyp (`paks_prototype.html`) ist bewusst Vanilla JS / Single-File — er dient nur als funktionale und visuelle Referenz. Die echte App wird in Vite + React neu aufgebaut, nicht aus dem Prototyp portiert.

---

## Aktueller Stand

Ein funktionierender Prototyp existiert als einzelne HTML-Datei (`radlearn_prototype.html`). Dieser enthält:

- Fall anlegen mit Bild-Upload (drag & drop), Titel, Modalität, Region, Beschreibung, persönliche Notizen, freie Tags
- Dateiname kann automatisch als Titel übernommen werden
- Diashow-Modus mit 5 Beschriftungs-Modi: Verborgen / Aufdecken / Einblenden / Darunter / Immer
- Stichwort-Galerie: alle Bilder zum selben Tag nebeneinander
- Volltextsuche (Titel, Beschreibung, Notizen, Tags)
- Sidebar-Filter nach Modalität / Region / „Mit Notizen"
- Kachel- und Listenansicht
- Tastaturnavigation in der Diashow (←→, Space, Esc)
- Clipboard-Paste (Strg+V): Screenshot mit OS-Tool machen, direkt ins Upload-Feld einfügen
- Reine Notizen (ohne Bild): eigener „Notiz"-Button, Text-Kachel-Layout, Filter „Reine Notizen". Erscheinen NICHT in der Diashow (nur Bild-Fälle). Beide Textfelder (Beschreibung + Notizen) sind durchsuchbar.
- Demo-Daten beim ersten Start

---

## Nächste Feature-Prioritäten

> **Status-Legende:** ✅ erledigt · 🟡 teilweise · ❌ offen. Stand: 2026-06-16.
> Der Status spiegelt den tatsächlichen Code-Stand; die Priorisierung der noch
> offenen Punkte bleibt wie nummeriert.

### 1. Konfigurierbares Tag-System (höchste Priorität) — ✅ ERLEDIGT
Nutzer definiert selbst Tag-Gruppen:
- Gruppe hat: Name, Farbe (Hex), optional Pflichtfeld ja/nein
- Innerhalb einer Gruppe: beliebige Werte (Freitext oder vordefinierte Liste)
- Standard-Gruppen beim ersten Start: „Modalität" (blau) und „Region" (grün) – entsprechen den bisherigen hardcodierten Feldern
- Freie Tags (ohne Gruppe) bleiben weiterhin möglich
- UI: Einstellungs-Modal „Tag-Gruppen verwalten"
- Sidebar und Karten passen sich dynamisch an die definierten Gruppen an

### 2. Import des eigenen Bestands (hohe Priorität — erster echter Nutzen) — ✅ WEITGEHEND ERLEDIGT
Ordner mit bereits benannten, getaggten Screenshots auf einmal einlesen. Dateiname → Titel. Das aktiviert brachliegende Sammlungen (der akute Schmerzpunkt) und liefert sofort Wert beim ersten Start.

> **Stand:** Mehrfach-Upload / Drag&Drop erledigt; Dateiname→Titel inkl. konfigurierbarem Aufteilen (Titel + Notizen, Trennzeichen wählbar, Settings). Datei-Datum (`fileModified`) wird beim Import mitgespeichert. **Offen:** echtes *Ordner*-Einlesen (Verzeichnis-Picker) — aktuell nur Mehrfach-Dateiauswahl.

### 3. Datendatei & Geräte-Übertragung (Weg B + Fallback) — 🟡 TEILWEISE

> **Stand:** Weg A (Export/Import JSON) erledigt — Abschnitt „Daten & Backup" im Settings-Modal (`downloadSnapshot`/`readSnapshotFromFile`, Restore ersetzt den Snapshot). **Offen:** Weg B (FileSystemAdapter / lebende Datei) — der vereinbarte nächste Schritt; Adapter-Interface (`capabilities.pickFile`) ist vorbereitet. **Offen:** Duplikaterkennung via ID (Import ist aktuell *Ersetzen*, kein Merge).

- **Weg B (primär):** File System Access API — App wählt beim Start eine Datendatei (auf USB-Stick oder Festplatte), liest/schreibt fortlaufend hinein. Stick-Betrieb ohne Export-Schritt. Datei kopierbar = Backup/Transfer.
- **Weg A (Fallback):** Export/Import als JSON für Firefox/Safari, Backups, Geräte ohne FS Access API. Duplikaterkennung via ID.
- Datenschutzhinweis beim Export/bei Stick-Nutzung: keine Patientendaten / nur anonymisierte Screenshots.
- Export: alle Fälle inkl. Bilddaten als JSON-Datei
- Import: JSON einlesen, Duplikate erkennen (via ID)
- Zweck: Gerätewechsel ohne Cloud; kein Sync-Server nötig
- Datenschutzhinweis beim Export: „Stelle sicher, dass keine Patientendaten enthalten sind"

### 4. Batch-Import: PDF & PPTX (mehrere Folien auf einmal) — ❌ OFFEN
Senkt die Migrations-Hürde für Radiologen, die ihre Fälle bereits in PowerPoint sammeln. Beide Wege laufen **vollständig client-side** (kein Backend, Lokal-only bleibt gewahrt).

**Weg A – PDF-Import (Primärweg, empfohlen):**
- Bibliothek: **pdf.js** (Mozilla), rendert jede Seite zu einem Canvas → PNG
- Nutzer exportiert in PowerPoint: Datei → Exportieren → PDF, lädt das PDF hoch
- Jede Seite = ein Fall, **inkl. Text/Pfeilen/Beschriftungen**, weil die Folie als Ganzes gerendert wird
- Das ist der einzige browserseitige Weg, eine Folie *als Ganzes* (nicht nur Rohbilder) zu bekommen

**Weg B – PPTX-Bildextraktion (Sekundärweg, mit Hinweis):**
- Bibliothek: **JSZip** (.pptx ist ein ZIP-Archiv)
- Zieht Rohbilder aus `ppt/media/`
- Schneller, aber **nur nackte Bilder ohne Folientext/Annotationen** – eine Folie mit Bild + Beschriftung + Pfeil wird zu separaten Dateien, Text geht verloren
- UI-Hinweis erforderlich: „Nur Bilder ohne Folientext. Für vollständige Folien bitte als PDF exportieren."

**Gemeinsamer Batch-Flow (beide Wege):**
- Nach Extraktion: Vorschau-Galerie aller Seiten/Bilder
- Nutzer kann einzelne ab-/auswählen
- Ausgewählte werden gesammelt als Fälle angelegt (Titel zunächst „Folie 1", „Folie 2" … oder Dateiname, danach einzeln editierbar)
- Tag-Gruppen können optional für den ganzen Batch vorbelegt werden

### 5. Shuffle-Modus in der Diashow — ❌ OFFEN (Diashow selbst noch nicht gebaut)

### 6. Spaced Repetition (SM-2) — ❌ OFFEN
- Pro Fall: Wiederholungsdatum, Intervall, Easiness-Factor
- Nach Diashow-Karte: Selbstbewertung 1–4 (Wieder / Schwer / Gut / Leicht)
- „Fällige Fälle heute" als Filter in der Sidebar
- Kein komplexes Scheduling – einfache SM-2-Implementierung reicht

### 7. Vorkuratierte Basisbibliothek — ❌ OFFEN (nur Demo-Seed vorhanden)
- Normalbefunde + typische Pathologien als mitgelieferter JSON-Seed
- Lizenz: nur CC-lizenziertes Material (Radiopaedia CC BY-NC-SA) oder eigenes Material
- Nutzer kann Seed-Fälle behalten, editieren oder löschen

### 8. Kachelgröße: skalierbares justified Grid (UI-Komfort) — ❌ OFFEN
Ein **Regler über dem Kachel-Grid** (analog Windows Explorer „Symbol → große Kachel") steuert die **Zeilenhöhe** der Kacheln.
- **Layout-Prinzip:** einheitliche Höhe pro Zeile, **variable Breite je nach Seitenverhältnis** des Bildes (justified image grid, „Google-Fotos"-Stil). Querformat → breite Kachel, Hochformat → schmale; alle Kacheln einer Zeile gleich hoch und bündig abschließend, Zeile gefüllt und ausgerichtet.
- Bilder behalten ihr **Seitenverhältnis** (keine Verzerrung, kein Beschnitt).
- Der Regler skaliert die Zeilenhöhe von **klein** (viele kleine Kacheln pro Zeile) bis **groß** (wenige große).
- **Ausdrücklich NICHT Masonry** (variable Höhe / feste Spalten) – bewusst die andere Achse: Höhe fix pro Zeile, Breite variabel.
- Gewählte Stufe in den **Settings persistieren**.

### 9. Duplikat-Erkennung — ❌ OFFEN
Doppelt vorhandene Bilder im Bestand finden.
- **Stufe 1 (zuerst, einfach & zuverlässig):** exakte Duplikate über einen **Hash der Bilddaten** (z. B. SHA-256 der base64/Bytes). Deckt versehentliches Mehrfach-Hochladen *derselben* Datei ab. Eindeutig, keine Graubereiche.
- **Stufe 2 (später, optional):** ähnliche/fast gleiche Bilder über **perceptual hashing** (erkennt andere Auflösung/Ausschnitt/Kompression). Aufwändiger, mit Graubereichen (Schwellwert nötig, mögliche Fehltreffer).
- **Offene Entscheidung:** Prüfung **beim Import** (Warnung vor dem Hinzufügen) und/oder **nachträglich** als „Duplikate finden"-Funktion über den ganzen Bestand. Beides denkbar — beim Import verhindert Dubletten früh, die Bestands-Funktion räumt Altbestand auf.

### 10. Filter „ohne Tags" — ✅ ERLEDIGT
Sonderfilter in der Sidebar (analog zu „Reine Notizen" / „Mit Notizen"), der nur Fälle zeigt, die **keinerlei Tag-Zuordnung** haben: keine Werte in irgendeiner Gruppe **und** keine freien Tags.
- **Zweck:** nach einem Massen-Import die noch **ungetaggten** Fälle als Arbeitsliste finden und nachträglich taggen.
- **Umsetzung:** `ActiveFilter`-Typ `untagged` + `isUntagged()`-Helper in `filter.ts`, Zähler `untagged` in `viewCounts`, „Ohne Tags"-Eintrag mit Trefferzähler in der Sidebar unter „Ansicht". Taggt man einen Fall der Liste, fällt er aus dem gefilterten Set (Arbeitsliste schrumpft beim Durchtaggen).

### 11. Zuordnungs-Quiz (Lern-Modus) — ❌ OFFEN
Aktiver-Abruf-Spiel als zweite Lern-Variante neben Diashow/SM-2: **N Bilder + N zugehörige Begriffe** werden gezeigt, der Nutzer **ordnet jedem Bild den passenden Begriff zu**, die Auswertung zeigt die Treffer.
- **Begriff = je ein sinntragendes Schlüsselwort pro Bild**, abgeleitet aus den Metadaten (Titel/Notizen).
- **Offene Kernfrage — wie wird das Schlüsselwort pro Bild bestimmt?**
  - **Option A (automatisch):** erstes Nicht-Stoppwort bzw. erstes Titelwort. Schnell, ohne Pflegeaufwand, aber teils **mehrdeutig oder schlecht** gewählt.
  - **Option B (nutzergesteuert):** pro Fall ein **markiertes Quiz-Schlüsselwort** oder eine feste Konvention (z. B. „erstes Titelwort"). Mehr Pflege, dafür **eindeutiger/kontrollierter**.
    - **Idee zur Umsetzung (niedrigschwellige Markierung):** Schlüsselwörter direkt vom Nutzer markieren – per **einfacher Geste** (z. B. **Strg+Klick auf ein Wort** in Titel/Notiz), das Wort wird damit als Quiz-Schlüsselwort des Falls gespeichert. **Niedrigschwellige Kuratierung statt automatischer Wortwahl**; löst die Mehrdeutigkeits-/Qualitätsfrage, weil der Nutzer das **eindeutige, sinntragende Wort selbst bestimmt**. Passt zum Prinzip **„Atlas durch gepflegte Metadaten"** – kleine, beiläufige Pflegeschritte erhöhen den Lernwert.
- **Mehrdeutigkeit vermeiden:** im selben Quiz **kein zwischen zwei Bildern geteiltes Schlüsselwort** (sonst ist die Zuordnung nicht eindeutig lösbar) — beim Zusammenstellen des Sets prüfen/ausschließen.
- **Feature-Familie:** gehört mit **Diashow (#5)** und **Spaced Repetition (#6)** zusammen — geteilte Logik: **gefiltertes Set** als Quell-Pool, **Metadaten als Frage/Antwort**. Bewusst **gemeinsam konzipieren** (eine Abruf-/Lern-Engine), nicht als isoliertes Einzelfeature bauen.

> **Hinweis zu Option B (Strg+Klick-Markierung):** Die niedrigschwellige Markierung von Quiz-Schlüsselwörtern per **Strg+Klick auf ein Wort** in Titel/Notiz ist oben unter Option B bereits beschrieben — **niedrigschwellige Kuratierung statt automatischer Wortwahl**.

### 12. Video-Fälle: Einbetten (Standard) + Pfad-Referenz (für große Dateien) — ✅ ERLEDIGT
Use Case: **eigene Lehr-/Fallvideos über Metadaten auffinden und lernen**. Zwei sich ausschließende Wege, im Video-Register umschaltbar; das Datenmodell unterscheidet sie sauber (`isVideoCase` / `isEmbeddedVideo` / `isReferencedVideo` in `src/lib/video.ts`):
- **Einbetten (Standard, `videoData`):** Videodatei wird wie Bilder **in PAKS gespeichert** (base64-Data-URL in der Datendatei/IndexedDB) und im Detail/in der Lightbox über einen **integrierten HTML5-`<video>`-Player** (native Controls) **direkt abgespielt**. Der Player bekommt bewusst **keine** Bild-Zoom/Pan-Handler — die Pointer-/Wheel-Gesten gehören den Controls.
- **Per Pfad referenzieren (`videoPath`, für große Videos):** nur **Verweis + Thumbnail** in PAKS, **kein GB-Video** in Datei/Export; Abspielen **extern**. Best-Effort `window.open(file://…)` (Chromium blockt meist); **„Kopieren"** (Pfad → Explorer/Finder) ist der verlässliche Weg. **Einschränkung:** Referenz **bricht** bei Verschieben/Umbenennen oder anderem Rechner.
- **Eindeutiger Zustand:** ein Video-Fall ist **entweder** eingebettet **oder** referenziert, nie beides — beim Speichern wird nur das Feld des aktiven Modus gesetzt, das andere auf `undefined`.
- **Größenwarnung:** vor dem Einbetten einer Datei **> 50 MB** deutlicher Hinweis (vergrößert Datendatei, verlangsamt Laden/Export; base64 ~+33 %), Empfehlung Pfad-Weg — **Fortfahren möglich**.
- **Thumbnail:** automatisch via verstecktem `<video>` + Canvas (`extractVideoThumbnail`, Helligkeits-Check, Best-Effort); Fallback **manuell wählen** (Upload/Drag/Strg+V), jederzeit überschreibbar. Dient als Kachelvorschau + Player-Poster.
- **Pfad:** browser-bedingt **manuell eingegeben** (Dateiauswahl gibt keinen OS-Pfad preis).
- **UI:** Play-Badge auf der Kachel, „Video"-Knopf in der Sidebar; eingebettet → Player in der Lightbox, referenziert → Pfad-Zugang (Abspielen/Kopieren).
- **Bestandskompatibilität:** additive optionale Felder, keine Schema-Migration; bestehende Pfad-Video-Fälle laufen unverändert.

### 13. Sicherungs-Sichtbarkeit (Speicher-Status + Schnellzugang) — ✅ WEITGEHEND ERLEDIGT
Damit Nutzer ihre Daten nicht unwissentlich nur im flüchtigen IndexedDB halten und bei „Browserdaten löschen" verlieren. Abgedeckt durch den **Speicher-Kontrollbereich in der Kopfzeile** (Schnellzugang außerhalb der Einstellungen):
- **Save-Indikator** (`FileSaveIndicator`) — reine Statusanzeige bei verbundener/getrennter/fehlerhafter Datei.
- **Verbinden/Trennen-Button** (`FileConnectButton`) — Datei anlegen/öffnen bzw. trennen (mit Warn-Rückfrage), abgestimmt mit dem Reconnect-Band (keine Doppelung).
- **Schnell-Backup-Button** (`QuickBackupButton`, #21) — Ein-Klick-JSON-Export, aktiv im unverbundenen Zustand.
- **Optionaler Rest:** ein *aktiver* Warnhinweis im unverbundenen Zustand (über die Tooltips/den ausgegrauten Save-Indikator hinaus). Bewusst zurückgestellt — der Schnellzugang macht Verbinden/Exportieren ohnehin sichtbar; nur nachrüsten, falls gewünscht.

### 14. Kategorien/Werte per Drag & Drop umsortieren (nur Reihenfolge, kein Umhängen) — ❌ OFFEN
Tag-Gruppen **untereinander** und Werte **innerhalb ihrer Gruppe** per Drag umsortieren — **nur Reihenfolge**, kein Umhängen zwischen Gruppen.
- **Persistenz:** neue Reihenfolge nach Reload erhalten, über **Dual-Write** auch in der Datei; als **`applyMutation`/undo-fähig**.
- **KRITISCH — Kollision mit bestehendem Tagging-Drag vermeiden:** das bestehende Tagging-Drag (Kachel aus dem Grid auf einen Wert) und das Sidebar-interne Umsortieren müssen **sicher unterschieden** werden — eigene **Drag-Quelle / MIME-Typ** fürs Umsortieren, getrennt von der Tag-Aktion.
- **Visuelles Drop-Feedback:** klare **Einfügemarke**.
- **Vor dem Bauen klären:** (1) Unterscheidung der zwei Drag-Arten, (2) **Touch-Tauglichkeit**.

### 15. Direkt-Bearbeiten-Button in der Kachel — ✅ ERLEDIGT
Kleiner **Stift-Button** in der oberen linken Ecke der Kachel (`EditButton` in `CaseCard.tsx`), öffnet das **vorbefüllte Bearbeiten-Formular direkt** — ohne Umweg über die Lightbox.
- **Einblendung:** per **Hover** dezent (`group-hover`); auf Touch/ohne Maus (`@media (hover:none)`) dauerhaft leicht sichtbar, sonst per Finger nicht erreichbar.
- **Kollisionsfrei:** liegt als `role=button`-Span IM Kachel-Button (kein verschachteltes `<button>`), kapselt aber Klick/Doppelklick/Pointer/Dragstart (`stopPropagation` + `draggable=false`) → löst **weder Auswahl noch Lightbox noch Drag** aus.
- Verdrahtet über `CaseGrid` (`onCardEdit`) → AppShell (`setEditCase`).

### 16. Kombiniertes Filter-System (mehrere Kriterien verknüpfen) — ❌ OFFEN
**Aktueller Stand:** Immer nur **ein** Filter aktiv. Die Sidebar trennt seit Kurzem sauber **Typ** (Alle/Bilder/Videos/Notizen) von **Eigenschaft** (Mit Notizen, Ohne Tags) und Tag-Werten — aber alle drei Familien schließen sich noch **gegenseitig aus** (ein `ActiveFilter` in `filter.ts`).

**Ziel:** mehrere Kriterien **gleichzeitig** verknüpfen. Das betrifft **drei zusammengehörige Dinge, die als EIN System** gelöst werden — bewusst **nicht einzeln**, sonst entstehen mehrere nebeneinanderstehende Kombinier-Logiken:
1. **Typ-Filter × Eigenschafts-Filter kombinieren** — z. B. „Videos" UND „Ohne Tags" als Arbeitsliste.
2. **Mehrere Tag-Werte mit UND/ODER-Schalter** — aktuell filtert die Auswahl nur **eines** Werts. UND: Fall erfüllt **alle**; ODER: **mindestens eines**.
3. **Facetten-Modell über Kategorien** — innerhalb einer Kategorie **ODER**, zwischen Kategorien **UND** (das übliche intuitive Verhalten, z. B. „**(CT oder MRT) UND Schädel**").

- **Vor dem Bauen:** ein **gemeinsames Konzept für die Kriterien-Verknüpfung** entwerfen (ein Filter-Zustand, der Typ + Eigenschaften + Tag-Facetten zusammen trägt), statt mehrere getrennte Kombinier-Logiken. Auch klären: **Darstellung** der aktiven Mehrfachfilter und **Zusammenspiel** mit den Sonderfiltern.

### 17. Bild-Annotationen (ein-/ausblendbar) — ✅ ERLEDIGT
Einfache, ein-/ausblendbare Markierungen **über dem Bild**: **Pfeile** und **Kreise/Rechtecke** in drei festen Farben (Rot/Gelb/Grün, je nach Bildkontrast).
- **Datenmodell (`Annotation` in `types.ts`):** Overlay-Vektordaten am `Case` (`annotations?`), **NICHT eingebrannt** — Originalbild unberührt, jederzeit zeig-/verbergbar und editierbar. Formen mit **Koordinaten 0..1 relativ zum Bild** (arrow = zwei Punkte, circle/rect = Bounding-Box) + Farbe. **Additiv & optional**, keine Schema-Migration; fließt automatisch durch **Dual-Write + Export** (Teil des Snapshots).
- **Editor in der Lightbox:** Zeichnen-Modus (Stift-Toggle) mit schwebender Werkzeugleiste (Werkzeug + Farbe), Form per Ziehen anlegen; bestehende Form anklicken = auswählen, dann **Löschen** (Entf/Papierkorb) oder **Umfärben**. Jede Aktion ist eine `updateCase`-Mutation → **undo-fähig**.
- **Anzeige-Schalter** (Auge-Toggle): globaler An/Aus pro Bild; Default **sichtbar**. Passt zum **aktiven-Abruf-Prinzip** (Bild nackt → überlegen → einblenden).
- **Zoom-Zusammenspiel:** Overlay (`AnnotationLayer.tsx`, SVG) liegt **im transformierten Stage-Wrapper** und ist mit dem Bild im selben Grid-Feld gestapelt → zoomt/pant **gemeinsam**, sitzt durch die relativen Koordinaten am Befund. **Zeichnen auf jeder Zoomstufe** (Pointer→normiert über das gemessene Rect); im Zeichen-Modus ist Pan/Navigation aus (Ziehen = Zeichnen, Esc verlässt erst den Modus).
- **Kachel-Indikator:** dezentes Stift-Badge (oben rechts) bei `annotations?.length` — **zeichnet die Annotationen nicht** aufs Thumbnail.
- **Offen / später:** Verschieben/Resize bestehender Formen per Anfasser; Aufdecken im Diashow-Drill (sobald die Diashow steht).

### 18. Schnell-Löschen-Button in der Kachel — ✅ ERLEDIGT
Analog zum **Direkt-Bearbeiten-Button** (#15, Hover-Stift) ein kleiner **Lösch-Button (Mülleimer-Icon)** (`DeleteButton` in `CaseCard.tsx`), direkt **darunter**, zum schnellen Löschen eines Falls **ohne Umweg über die Lightbox**.
- **Gleiche Kollisionsvermeidung wie der Bearbeiten-Button:** als `role=button`-Span IM Kachel-Button, Klick/Doppelklick/Pointer/Dragstart kapseln (`stopPropagation` + `draggable=false`) → **kein** Auswählen/Lightbox/Drag.
- **Einblendung:** dezent per Hover (Touch: dauerhaft leicht sichtbar), wie beim Stift.
- **Versehentliches Löschen vermeiden:** **Sicherheits-Rückfrage** (`window.confirm`) vor dem Löschen — zusammen mit Undo/Redo ist ein Papierkorb (#19) nicht zwingend nötig. Verdrahtet `CaseCard` → `CaseGrid` (`onCardDelete`) → AppShell (`deleteCase`, undo-/redo-fähig).

### 19. Papierkorb (Soft-Delete) — ❌ OFFEN
Fälle **nicht sofort endgültig** löschen, sondern erst in einen **Papierkorb** verschieben — **wiederherstellbar**, bis er geleert wird.
- **Idee:** technisch evtl. als **besonderer Zustand/Flag am Fall** (z. B. `deletedAt?`), **nicht** als sichtbarer Kategorienwert.
- **Sitzungsende-Verhalten:** entweder **automatisch leeren** oder **behalten** — **konfigurierbar**; plus **manuelles Leeren**.
- **OFFENE FRAGEN, vor dem Bauen zu klären:**
  1. **Aus der normalen Ansicht ausblenden** — Papierkorb-Fälle müssen aus **Grid, Suche, Diashow, Trefferzählern und Filtern** raus (sonst „löscht" der Papierkorb nicht, sondern versteckt nur halb). Zentral an der Filter-/Quelldaten-Schicht ansetzen, nicht pro UI-Stelle.
  2. **Eigene Papierkorb-Ansicht** zum **Wiederherstellen** / **endgültig Löschen**.
  3. **Verhältnis zum bestehenden Undo (Strg+Z):** Undo macht schon **einzelne** Löschungen rückgängig (Session-Ringpuffer); der Papierkorb wäre die **längerfristige** Variante. Abgrenzung/Zusammenspiel klären.
  4. **Export/Dual-Write:** gelöschte (Papierkorb-)Fälle **mitspeichern** oder **ausschließen**? Sitzt der Papierkorb als Flag am Fall, **wandert er sonst automatisch in die Datei** — bewusst entscheiden (z. B. beim Schreiben filtern vs. mitschreiben für geräteübergreifenden Papierkorb).

### 20. Weiß als Annotationsfarbe — ✅ ERLEDIGT
Die Farbauswahl der Bild-Annotationen (#17) um **Weiß** ergänzt — **Kontrastfarbe auf dunklen Bildbereichen**. `AnnotationColor` additiv um `'white'` erweitert (bestehende Annotationen unberührt), Weiß in `ANNOTATION_COLORS`; Werkzeugleiste, Umfärben und SVG-Pfeilkopf-Marker iterieren darüber. Aktiver Farb-Swatch als Akzent-Ring (auf jeder Füllfarbe inkl. Weiß sichtbar).

### 21. Schneller Backup-/Download-Button neben dem Speicherstatus — ✅ ERLEDIGT
Kleiner **Download-Button** (`QuickBackupButton`) in der Kopfzeile, löst den bestehenden JSON-Export (Weg A, `downloadSnapshot`) mit einem Klick aus — kein neuer Export-Pfad.
- **Ausgegraut** bei verbundener **lebender Datei** (Weg B, `fileStatus 'connected'` — dort wird laufend gesichert); in allen übrigen Zuständen aktiv.
- Teil des Speicher-Kontrollbereichs (#13).

### 22. Bilder als Dateien aus der JSON exportieren (Tag-gefiltert) — ❌ OFFEN
Eingebettete Bilder als **einzelne Dateien** (.jpg/.png) herausexportieren — **verlustfrei** (die base64-Data-URLs sind das vollständige Originalbild, reine Decodierung).
- **Umfang:** gesamter Bestand **oder** gefiltert nach **Tag/Kategorie**.
- **Format:** als **ZIP** mit sinnvollen Dateinamen (z. B. Falltitel).
- **Zweck:** macht PAKS zur durchsuchbaren Bildablage für kuratierte Sets (**Paket-/Atlas-Gedanke**).
- **Offen:** Annotationen optional **einbrennen** oder **nackte Bilder** exportieren; Metadaten (Tags/Notizen) als **Begleit-Textdatei**.

### 23. Blau als Annotationsfarbe — ✅ ERLEDIGT
Die Farbauswahl der Bild-Annotationen (#17) um **Blau** (`#3b82f6`) ergänzt — kräftige Kontrastfarbe auf hellen/grauen Flächen. `AnnotationColor` additiv um `'blue'` erweitert (bestehende Annotationen unberührt), Blau in `ANNOTATION_COLORS`; Werkzeugleiste, Umfärben und SVG-Pfeilkopf-Marker iterieren über die Liste → automatisch dabei. Analog zu #20 (Weiß).

### 24. Einstellbare, bildschirm-konstante Annotations-Strichstärke — ✅ ERLEDIGT
Strichstärke der Annotationen (#17) **pro Annotation** wählbar (Dünn/Mittel/Dick) über drei Knöpfe in der Zeichnen-Werkzeugleiste; die Wahl gilt für neu Gezeichnetes und ändert — wie die Farbe — die aktuell ausgewählte(n) Form(en).
- **Bildschirm-konstant statt auflösungsabhängig:** `strokeWidth` ist eine **Ziel-Bildschirmstärke in CSS-px**. Das Rendern (`AnnotationLayer`) misst die **dargestellte (un-gezoomte) Overlay-Größe** über die Layout-Box (`clientWidth`/`ResizeObserver`-`contentRect`, vom Zoom-`transform` unberührt) und rechnet die Zoomstufe heraus: `swUser = px × maxNatural / (displayedLong × zoomScale)`. Ergebnis: gleiche optische Dicke über **native Auflösung UND Zoom**. `markerUnits="strokeWidth"` zieht den Pfeilkopf mit.
- **Datenmodell:** additives optionales `strokeWidth?` (CSS-px) an `AnnotationBase`. `resolveStrokePx()` erkennt Alt-Werte an der Größenordnung (alte Bruchteil-Presets < 1 → nächste px-Stufe; `undefined` = alter fixer Default 0,005 ≈ **Dick**) — **keine Datenmigration**, Alt-Annotationen bleiben treu.

### 25. „Alle Annotationen markieren" + Mehrfachauswahl — ✅ ERLEDIGT
Annotations-Auswahl von Einzel- auf **Mehrfachauswahl** umgestellt (`selectedAnnIds: string[]`): Einzelklick wählt eine Form, Hintergrundklick leert. Neuer Knopf in der Zeichnen-Werkzeugleiste wählt **alle** Formen des Bildes → gemeinsam **löschen** (Entf/Papierkorb) oder **umfärben/Strichstärke ändern**. Jede Aktion bleibt eine `updateCase`-Mutation → undo-fähig.

### 26. Dateiname im Speicherstatus-Tooltip — ✅ ERLEDIGT
`FileSaveIndicator` zeigt beim Hover die **konkrete lebende Datei** („Lebende Datendatei: \<name>"). Hinweis im Tooltip, dass die File System Access API browser-bedingt **nur den Dateinamen, nicht den vollständigen Pfad** preisgibt (damit der Name nicht als unvollständig missverstanden wird). Teil des Speicher-Kontrollbereichs (#13).

### 27. Annotationen mit Text-Labels (+ Bild↔Listen-Indizierung) — ✅ ERLEDIGT
Annotationen (#17) können einen **optionalen Beschriftungstext** bekommen, der geordnet im neuen Bereich „Markierungen" **unter den Notizen** erscheint.
- **Datenmodell:** additives optionales `label?` an `AnnotationBase` (leer = unbeschriftet; keine Schema-Migration, fließt durch Dual-Write/Export).
- **Eingabe:** schwebendes Text-Eingabefeld im **Screen-Space** (nicht im transformierten Wrapper → bei jedem Zoom lesbar konstant), Position aus `annotationAnchor` × live gemessener Bild-Box (`useLayoutEffect`, folgt Zoom, in den Bildbereich geklemmt). **Neu gezeichnet** → Feld mit Fokus (direkt lostippen); **vorhandene Form angeklickt** → Feld ohne Fokus (so löscht Entf weiter die Form). Commit gebündelt bei **Enter/Blur** (eine `updateCase`-Mutation → Undo bündelt; nicht pro Tastendruck), **Esc verwirft**.
- **Indizierung (`computeAnnotationIndices`):** nur **beschriftete** Annotationen, gruppiert nach **Form+Farbe** (`type:color`) in Erstellreihenfolge — Kombination einmalig → **kein Index**; ab zwei → fortlaufend `1,2,3 …`. Eine `id→Nummer`-Map → **konsistent in Bild und Liste**, dynamisch (Löschen renummeriert).
- **Bild-Badge (`IndexBadge`):** kleine Nummern-Scheibe in Annotationsfarbe + Kontrastziffer, **nur wenn indiziert** (ab der 2. gleichen Form+Farbe); beschriftet-aber-einzeln/unbeschriftet bleibt im Bild nackt. **Bildschirm-konstant** über die `swUser`-px-Umrechnung (#24).
- **Liste:** je beschrifteter Annotation `[Form-Symbol]` + optionaler Index + Label, alles in der Annotationsfarbe; eigener scrollbarer Block, **immer sichtbar**.

### 28. Auswahl/Bewegen-Werkzeug + Liste→Bild-Auswahl — ✅ ERLEDIGT
Zwei Ergänzungen am Annotations-Editor (#17/#27).
- **Auswahl/Bewegen-Werkzeug (`'select'`, `ToolKind`):** viertes Werkzeug (Cursor-Icon) vor Pfeil/Kreis/Rechteck und **Default beim Betreten** des Zeichen-Modus (man betritt ihn „sicher" zum Schauen/Auswählen, statt sofort zu zeichnen). Bei aktivem Select schaltet das SVG-Overlay auf `pointer-events: none` → Hintergrund-Gesten fallen auf den Stage-Wrapper durch (**Pan** bei Zoom, **Strg+Rad-Zoom** wie gehabt), während die **Form-Trefferflächen** sich per `pointer-events: visiblePainted` selbst re-aktivieren und klickbar bleiben (auswählen/umfärben/Stärke/löschen/relabeln). Pan-Guard von „aus sobald `drawMode`" auf `panAllowed = !drawMode || tool === 'select'` gelockert (weiterhin nur `scale > 1`); Stage-Cursor + Hinweistext passen sich an.
  - **Bewusste Konsequenzen:** im Select-Modus kein Deselektieren per Leerklick (Pan besitzt leere Drags — Abwahl über andere Form/Esc); Form-Innenflächen (Kreis/Rechteck) zählen als Treffer.
- **Liste → Bild (`selectFromList`):** Klick auf eine „Markierungen"-Zeile wählt die Annotation im Bild aus (Halo, Label-Editor ohne Fokus). Ist der Zeichen-Modus aus, wird er mit Auswahl/Bewegen aktiviert; die aktive Zeile ist dezent hinterlegt. Ergänzt die bestehende Bild→Liste-Zuordnung über den Index.

### Zusätzlich umgesetzt (außerhalb dieser nummerierten Liste) — ✅
Kam über die „Layout der Archiv-Funktion"-Sektion oder als Ad-hoc-Wünsche dazu:
- **Vollbild-Ansicht (Lightbox):** Doppelklick öffnet groß, Pfeil-Navigation im gefilterten Set, Bearbeiten/Löschen, aufklappbares Notizfeld (Default-Klappstatus in Settings).
- **Grid-Bedienung:** Sortierung (Titel/Datum, auf/ab, persistiert) · Mehrfachauswahl (Klick / Strg / Shift) · Löschen per Entf (mit Anzahl-Rückfrage) · Drag&Drop-Tagging inkl. Mehrfachauswahl.
- **Undo/Redo** (Strg+Z bzw. Strg+Y / Strg+Shift+Z, Toolbar-Buttons + Buttons in der Lightbox-Zeichenleiste): Session-Ringpuffer am `applyMutation`-Pfad. Redo ist das Spiegelbild von Undo; beide umgehen `applyMutation`, sodass nur echte Mutationen den Redo-Stack kappen (keine widersprüchlichen Historien). Toast-Rückmeldung („Rückgängig: …" / „Wiederhergestellt: …").
- **Suche:** Groß-/Kleinschreibung-Umschalter (persistiert), Clear-✕ im Feld, Esc leert.
- **Lightbox-Politur:** Klick auf den leeren Hintergrund neben dem Bild schließt (echter Leerklick, kein Drag-Ende/Inhalts-Klick, nicht im Zeichen-Modus) · Kopfzeilen-Buttons absolut verankert (springen beim Blättern nicht mehr) · sehr hohe Bilder passen vollständig in die Bühne (minmax(0,1fr)-Grid, Overlay bleibt deckungsgleich) · Undo-Button in der Zeichenleiste.
- **Konstante Grid-Kachelhöhe:** unabhängig vom Bild-Seitenverhältnis (Bild absolut im `aspect-square`-Rahmen, `object-cover`) UND von Tag-Anzahl/-Länge (feste einzeilige Tag-Zone mit gemessenem „+N" und Ellipsis); „Notiz vorhanden" als Eck-Badge statt variabler Body-Zeile. Listen-Modus: horizontale Zeile mit festem 96px-Thumbnail.
- **Hauptbereich-Werkzeugleiste:** oben **sticky** (deckender Hintergrund, scrollende Kacheln scheinen nicht durch) · auf gleiche Höhe/Mitte wie der Sidebar-Kopf ausgerichtet · **einzeilig & container-responsive** (progressive Reduktion: Undo/Redo→Icon, „Sortieren"-Label weg, Fälle-Anzeige nur Zahl), konstante Höhe über alle Breiten.
- **Import-Dialog:** Dateinamen-Aufteilung (Titel/Notizen) als **sichtbare** Option mit Trennzeichen + Live-Vorschau (Titel | Notiz); Wahl persistiert, teilt geladene (nicht manuell editierte) Einträge sofort neu auf (Teil von #2).
- **Tooling/Qualität:** ESLint (`rules-of-hooks`) + Typecheck als `lint`-Script, im Build vorgeschaltet und als Pre-Commit-Hook (Husky) — nur lauffähige Stände sind committbar.

### Nächste Schritte (Stand 2026-06-16)
- **Weg B (lebende Datei, #3)** — der vereinbarte nächste Datensicherheits-Schritt.
- **Diashow** (Grundlage für #5 Shuffle und #6 SM-2) — baut auf der Lightbox auf; Nutzer wollte zuvor mit echtem Bestand dogfooden.

---

## Design-Prinzipien

- **UI-Sprache: Deutsch** (Endnutzer sind deutschsprachige Radiologen)
- **Code-Sprache: Englisch** (Variablen, Funktionen, Kommentare)
- **Dark mode only** – Farbschema: `#0d1117` Hintergrund, `#2a7db8` Akzent
- Notizen visuell von Beschreibung abgesetzt (goldgelb: `#d4c97a`)
- Kein unnötiges UI-Rauschen – Radiologen arbeiten konzentriert

## Layout der Archiv-Funktion (analog neurorad-strukturen.ch)

Das Grundlayout orientiert sich bewusst am Layout der Strukturen-App (siehe `design-referenz/`, falls vorhanden — **nur als visuelle Referenz lesen, nichts importieren**):

- **Linke Seitenleiste:** nutzerdefinierte Kategorien, **gruppiert** (Gruppe → Werte, z. B. „Modalität" → CT, MRT, …). Gruppen sind vom Nutzer **priorisierbar** (Reihenfolge festlegbar) und aufklappbar. Auswahl filtert das Hauptfeld.
- **Suchfeld:** über der Seitenleiste, Volltext über Titel, Beschreibung, Notizen, Tags.
- **Hauptfeld:** passende Fälle als **Kacheln** (Bild-Vorschau + Titel + Tag-Chips).
- **Vergrößerung bei Doppelklick:** Kachel öffnet sich zur **Vollbild-Ansicht** (PowerPoint-artig), mit **Navigation zum nächsten/vorherigen** Fall (Pfeiltasten + Klick), bleibt im aktuell gefilterten Set. Esc schließt zurück.
- **Notizen in der Vollbild-Ansicht:** als **Hover-Klappbox** — am Rand eingeklappt, klappt beim Drüberhovern auf. Stört die Bildbetrachtung nicht, ist aber jederzeit greifbar.

---

## Datenschutz-Entscheidungen

- **Lokal-only ist ein Feature**, kein Kompromiss
- Kein Cloud-Sync – volle Verantwortung beim Nutzer
- Hinweis beim ersten Start: keine Patientendaten hochladen
- Export/Import als einziger Weg zum Gerätewechsel
- Keine Telemetrie, kein Analytics, kein CDN für Schriften (alles lokal)

---

## Was dieses Projekt NICHT ist

- Kein DICOM-Viewer (Screenshots reichen für den Use Case)
- **Keine DICOM-Stacks.** Bewusst und endgültig ausgeschlossen: widerspricht dem Kernversprechen (leicht & schnell), bricht die Lokal-only-Datenschutzposition (DICOM-Header = Gesundheitsdaten), erfordert echten Viewer + Storage-Management. Nicht „Stufe 2", sondern raus.
- Kein kollaboratives Tool (single user)
- Kein Ersatz für Radiopaedia oder StatDx
- Nicht verwandt mit neurorad-strukturen.ch (anderes Produkt, anderer Stack, anderes Repo)

---

## Free / Premium (offene strategische Frage, noch nicht final)

Vorläufiger Schnitt:
- **Lite (kostenlos):** Archiv (anlegen, taggen, durchsuchen, Stichwort-Galerie, Import des eigenen Bestands) + **eine** Wiederholungs-Variante (Diashow mit Aufdecken). Die Lernfunktion ist also im Free *sichtbar* — sie trägt die Positionierung („nachhaltiges Lernen im Beruf") und darf nicht komplett hinter der Paywall liegen.
- **Premium:** **mehrere** Wiederholungs-Varianten (Galerie-Abruf, Shuffle, variierter Abruf), beiläufige „seltener zeigen"-Markierung, Spaced-Repetition-Scheduling (SM-2).

Begründung: Das Archiv zieht rein und beweist Wert (löst den akuten Schmerz: brachliegender Screenshot-Bestand). Die *Vielfalt* der Wiederholungsmodi ist das, was Langzeitnutzung trägt — also der Premium-Hebel. Variierter Abruf ist zugleich lernpsychologisch der wirksamere Teil.

**Auslieferungsmodell (entschieden):** PAKS wird als Download angeboten, den Premium-Kunden der neurorad-strukturen-App erhalten – aber als **eigenständiges, separates Produkt ohne technische Kopplung** an neurorad-strukturen. Die Zugangskontrolle passiert **außerhalb der App** (Premium-Kunde → Download-Link), nicht in PAKS selbst. Dadurch bleibt PAKS vollständig **lokal-only, kontofrei, ohne Backend/Login** – die saubere Architektur bleibt erhalten, und das Download+lokal-Modell folgt zwingend aus der Datenschutz-Logik (nichts berührt je einen Server; zugleich ein Verkaufsargument für datenschutzbewusste Ärzte). Verbesserte Versionen werden auf der Website bereitgestellt, bewusst **gering kuratiert** (kein Live-Produkt mit Support-Versprechen, geringer Pflegeaufwand).

> **Hinweis:** Dieses Download-Modell ersetzt die frühere Annahme, Premium erfordere „Konten, Login, Lizenzprüfung, Zahlung" in der App. Genau diese Kopplung wird durch die externe Zugangskontrolle umgangen – Lite *und* Premium bleiben lokal-only ohne Backend/Login.

**Packaging-Hinweis (für späteren Build-Schritt, nicht jetzt):** Da PAKS heruntergeladen und lokal gestartet wird, sollte die Auslieferung möglichst **niederschwellig** sein – idealerweise eine **einzige, leicht zu startende Einheit** (z. B. doppelklickbare Datei) statt eines zu entpackenden Pakets. Beim ersten Start braucht es eine **klare Ersteinrichtung** („wähle eine Datei/einen Ordner für deine Sammlung", Weg B), da jeder Kunde dieselbe Frage hat: wo liegen meine Daten?

---

## Optionale Stufe 2 (nicht jetzt)

Falls echtes „Snipping Tool"-Verhalten gewünscht wird (Region direkt auswählen, globaler Hotkey, sofort in App) – das geht NICHT in einer reinen Web-App (Browser-Sicherheit). Dann Umstieg auf **Tauri** (Rust-basiert, leichter als Electron) als Desktop-App. Das ist eine grundlegende Architektur-Entscheidung und kein inkrementelles Feature. Bis dahin deckt Clipboard-Paste (Strg+V) den Bedarf ab, da Nutzer ihre OS-Snipping-Tools ohnehin gewohnt sind.

---

## Ideen / Zukunft (geparkt — kein Code)

Strategische bzw. produktübergreifende Überlegungen, bewusst geparkt — nicht Teil der nummerierten Feature-Prioritäten.

### Marken-/Domain-Dach
Überlegung, von der produkt-/regionsgebundenen **neurorad-strukturen.ch** auf ein **neutrales Dach** umzustellen, unter dem die Apps als Subdomains hängen (`paks.`, `structures.`, `dd.`). Alternativ: die Apps unter dem **persönlichen Namen-Dach** (`michaelmarquardt.ch`) als Absender/Autorität, wobei die Produkte **eigenständige Domains** behalten und die Personen-Domain auf sie verweist (nicht umgekehrt).
- **Erkenntnis:** Die persönliche Domain ist im akademisch-medizinischen Kontext **nicht provinziell, sondern autoritativ**; sie ist **kein Verkaufshindernis** (Verkauf = ohnehin Migration).
- Für den **NeuroRad-Kongress** (Untersetzer-Druck) reicht die etablierte Produkt-URL neurorad-strukturen.ch — die Dach-Entscheidung muss dafür **nicht erzwungen** werden.
- **Migration** bewusst **einmalig**, wenn das Mehr-Produkte-Dach Form annimmt.

### DD-App als integrierendes Werkzeug auf der Strukturen-Datenbasis
Nicht eigenständig, sondern eine **zweite Sicht auf dieselbe Datenbasis**: Strukturen geht vom **Verdacht zum Differenzierungsweg** (top-down), die DD-App vom **Merkmal zur Diagnosenliste** (bottom-up). Beide sind Projektionen einer **richtungsneutralen Merkmals-Matrix** (Diagnose × Bildgebungsmerkmal). Da die bestehenden Schemata teils top-down, teils bottom-up vorgehen, **integriert** die DD-App diese heterogenen Sichten.
- **UI-Konzept:** Seitenleiste + **zweigeteiltes Hauptfenster** (oben Merkmals-Eingabe mit Vorschlagslisten + Freitextsuche, unten die sich fortlaufend **einengende DD-Liste**). Merkmals-Eingabe als **flexibler Korb** (beliebig viele Merkmale, nicht feste Listen).
- **WICHTIG zum Datenmodell:** nur das **POSITIV Vorliegende** pro Diagnose erfassen (nicht für jede Diagnose jede Kategorie als an/abwesend festlegen). „Merkmal nicht erfasst" ≠ „Merkmal abwesend" — der Filter darf ein fehlendes Merkmal **nicht** als hartes Ausschlusskriterium behandeln, sondern als **Ranking** arbeiten (passende Diagnosen oben, nichts verschwindet wegen Erfassungslücken). **Gezielte Ausnahme:** bei echten **Diskriminatoren** (Merkmale, die zwei ähnliche Diagnosen sicher trennen, z. B. CVS-Zeichen) bewusst eine **Abwesenheits-Aussage** erfassen.
- **Vorschlagslogik:** oben nur Merkmale anbieten, die bei den **verbleibenden** Diagnosen vorkommen und noch **diskriminieren**.
- **Datenpflege:** Vokabular/Kategorien legt der **Nutzer** fest (Kernarbeit, Expertise), die **KI** ordnet anhand der vorhandenen Strukturen-Materialien zu (Fleißarbeit) — **nur aus dem festen Vokabular**, mit **Quellenangabe**, vom Nutzer **abgenommen** (Halluzinationsrisiko → Abnahme-Gate).
- **Startpunkt:** ein Gebiet **hoher Schema-Dichte** als Prototyp, nicht die ganze Neuroradiologie.
- **Architektur offen:** zweiter Modus in der Strukturen-App vs. eigene App auf gemeinsamer Datenbasis.
