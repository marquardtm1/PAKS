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

> **Status-Legende:** ✅ erledigt · 🟡 teilweise · ❌ offen. Stand: 2026-06-12.
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

### 10. Filter „ohne Tags" — ❌ OFFEN
Sonderfilter in der Sidebar (analog zu „Reine Notizen" / „Mit Notizen"), der nur Fälle zeigt, die **keinerlei Tag-Zuordnung** haben: keine Werte in irgendeiner Gruppe **und** keine freien Tags.
- **Zweck:** nach einem Massen-Import die noch **ungetaggten** Fälle als Arbeitsliste finden und nachträglich taggen.
- Umsetzung passt ins bestehende Muster: neuer `ActiveFilter`-Typ (z. B. `untagged`) in `filter.ts` + Zähler in `viewCounts` + Sidebar-Eintrag unter „Ansicht".

### Zusätzlich umgesetzt (außerhalb dieser nummerierten Liste) — ✅
Kam über die „Layout der Archiv-Funktion"-Sektion oder als Ad-hoc-Wünsche dazu:
- **Vollbild-Ansicht (Lightbox):** Doppelklick öffnet groß, Pfeil-Navigation im gefilterten Set, Bearbeiten/Löschen, aufklappbares Notizfeld (Default-Klappstatus in Settings).
- **Grid-Bedienung:** Sortierung (Titel/Datum, auf/ab, persistiert) · Mehrfachauswahl (Klick / Strg / Shift) · Löschen per Entf (mit Anzahl-Rückfrage) · Drag&Drop-Tagging inkl. Mehrfachauswahl.
- **Undo** (Strg+Z + Toolbar-Button): Session-Ringpuffer am `applyMutation`-Pfad, mit Toast-Rückmeldung („Rückgängig: …").
- **Suche:** Groß-/Kleinschreibung-Umschalter (persistiert), Clear-✕ im Feld, Esc leert.
- **Tooling/Qualität:** ESLint (`rules-of-hooks`) + Typecheck als `lint`-Script, im Build vorgeschaltet und als Pre-Commit-Hook (Husky) — nur lauffähige Stände sind committbar.

### Nächste Schritte (Stand 2026-06-12)
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
