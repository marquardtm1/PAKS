import { useEffect, useRef, useState } from 'react'
import type { Settings } from '@/lib/types'
import { useStore } from '@/store/StoreProvider'
import { hasOwnData } from '@/lib/seed'
import { downloadSnapshot } from '@/lib/persistence/json'
import { Modal, ModalButton } from './Modal'

/**
 * Start-Dialog beim App-Öffnen, wenn KEINE lebende Datei verbunden ist (Weg B).
 * Abgestuft nach Datenlage — und beim ALLERERSTEN Start zusätzlich mit dem
 * Datenschutzhinweis verschmolzen (ein Dialog statt Banner + Dialog):
 *  - Erststart (Disclaimer noch nicht akzeptiert): kombinierter Dialog —
 *    Datenschutzhinweis + Willkommens-/Sicherungs-Teil, EINE Bestätigung. Bewusst
 *    NICHT per Esc/Hintergrund schließbar (Disclaimer muss quittiert werden);
 *    jede Aktion (Verbinden/Export/„Verstanden – später") akzeptiert ihn.
 *  - Fall A (Willkommen): kein eigener Bestand (nur Demo-Seed), Disclaimer bereits
 *    akzeptiert → freundlicher Hinweis, dauerhaft ausblendbar, leicht wegklickbar.
 *  - Fall B (Warnung): echte Fälle nur im flüchtigen IndexedDB → deutliche
 *    Warnung; bewusst NICHT dauerhaft abschaltbar, nur pro Sitzung schließbar.
 *
 * Erscheint ausschließlich bei fileStatus 'none'/'unsupported' — bei 'connected'
 * ist alles gesichert, bei 'needs-reconnect'/'error' besitzt das Reconnect-Band
 * die Aktion (keine Doppelung). Nutzt die bestehenden Funktionen
 * (connectNewFile/openExistingFile, downloadSnapshot) — kein neuer Pfad.
 */
export function StartupStorageDialog() {
  const {
    status,
    snapshot,
    fileStatus,
    fileRestoreSettled,
    updateSettings,
    connectNewFile,
    openExistingFile,
  } = useStore()

  const [open, setOpen] = useState(false)
  const [variant, setVariant] = useState<'welcome' | 'warning'>('welcome')
  // Erststart → Datenschutz-Block einblenden und bewusste Bestätigung verlangen.
  const [includeDisclaimer, setIncludeDisclaimer] = useState(false)
  const [dismiss, setDismiss] = useState(false)
  const [exported, setExported] = useState(false)
  // Genau einmal pro App-Start entscheiden (kein erneutes Aufpoppen, wenn der
  // Nutzer später in der Sitzung trennt o. Ä.).
  const evaluated = useRef(false)

  useEffect(() => {
    if (evaluated.current) return
    if (status !== 'ready' || !snapshot || !fileRestoreSettled) return

    // Ab hier ist fileStatus verlässlich → genau einmal entscheiden.
    evaluated.current = true
    if (fileStatus !== 'none' && fileStatus !== 'unsupported') return // verbunden / Band

    if (!snapshot.settings.disclaimerAccepted) {
      // Allererster Start: Disclaimer + Willkommen in EINEM Dialog. (Echte Daten
      // kann es hier noch nicht geben — vor dem ersten Akzept keine Datei/Import.)
      setIncludeDisclaimer(true)
      setVariant('welcome')
      setOpen(true)
    } else if (hasOwnData(snapshot.cases)) {
      setVariant('warning')
      setOpen(true)
    } else if (!snapshot.settings.startupNoticeDismissed) {
      setVariant('welcome')
      setOpen(true)
    }
  }, [status, snapshot, fileStatus, fileRestoreSettled])

  // Erfolgreich verbunden → Dialog schließen (egal über welchen Flow). Der
  // Disclaimer ist dann über den Verbinden-Knopf bereits quittiert (ack()).
  useEffect(() => {
    if (open && fileStatus === 'connected') setOpen(false)
  }, [open, fileStatus])

  if (!open || !snapshot) return null

  const supported = fileStatus !== 'unsupported'
  const isWarning = variant === 'warning'
  // Warnung bietet immer Export; Willkommen nur, wenn keine lebende Datei möglich
  // ist (unsupported) — sonst ist „Datei verbinden" dort der bessere Weg.
  const showExport = isWarning || !supported
  const caseCount = snapshot.cases.length

  // Beim Erststart akzeptiert JEDE bewusste Aktion den Datenschutzhinweis.
  const ackDisclaimer = () => {
    if (includeDisclaimer) updateSettings({ disclaimerAccepted: true })
  }

  const close = () => {
    const patch: Partial<Settings> = {}
    if (includeDisclaimer) patch.disclaimerAccepted = true
    if (variant === 'welcome' && dismiss) patch.startupNoticeDismissed = true
    if (Object.keys(patch).length > 0) updateSettings(patch)
    setOpen(false)
  }

  const onConnectNew = () => {
    ackDisclaimer()
    void connectNewFile()
  }
  const onOpenExisting = () => {
    ackDisclaimer()
    void openExistingFile()
  }
  const onExport = () => {
    ackDisclaimer()
    downloadSnapshot(snapshot)
    setExported(true)
  }

  const closeLabel = includeDisclaimer
    ? 'Verstanden – später / nur im Browser'
    : isWarning
      ? 'Schließen'
      : 'Später / nur im Browser'

  return (
    <Modal
      title={isWarning ? 'Daten nur im Browser gespeichert' : 'Willkommen bei PAKS'}
      onClose={close}
      maxWidth={460}
      // Erststart: nur per Knopf schließbar (Disclaimer bewusst quittieren).
      dismissable={!includeDisclaimer}
      footer={<ModalButton onClick={close}>{closeLabel}</ModalButton>}
    >
      <div className="space-y-4 px-5 py-4 text-[13.5px] leading-relaxed">
        {includeDisclaimer && (
          <div className="border-warning/40 bg-warning/10 text-text flex items-start gap-2.5 rounded-[var(--radius-card)] border px-3 py-2.5">
            <span className="shrink-0 text-base">⚠️</span>
            <p>
              <strong>Nur anonymisierte Bilder.</strong> Lade keine Patientendaten
              hoch (keine Namen, Geburtsdaten, IDs im Bild). Deine Daten bleiben
              lokal — liegen sie auf einem USB-Stick, ist ein Verlust dein Risiko.
            </p>
          </div>
        )}

        {isWarning ? (
          <p className="text-text">
            <span className="text-warning font-semibold">
              Deine {caseCount} {caseCount === 1 ? 'Fall liegt' : 'Fälle liegen'}{' '}
              aktuell nur im Browser
            </span>{' '}
            (flüchtiger Speicher) und {caseCount === 1 ? 'geht' : 'gehen'} bei
            „Browserdaten löschen" verloren. Sichere {caseCount === 1 ? 'ihn' : 'sie'}{' '}
            — am besten dauerhaft über eine verbundene Datendatei.
          </p>
        ) : (
          <p className="text-text">
            Deine Fälle werden vollständig <strong>lokal</strong> gespeichert — kein
            Konto, keine Cloud. Für dauerhafte Sicherung kannst du eine{' '}
            <strong>Datendatei verbinden</strong> (auf Festplatte oder USB-Stick);
            jede Änderung landet dann sofort darin. Ohne verbundene Datei liegen die
            Daten nur im Browser und gehen bei „Browserdaten löschen" verloren.
          </p>
        )}

        {supported && (
          <div className="flex flex-wrap gap-2">
            <ModalButton variant="primary" onClick={onConnectNew}>
              Neue Datendatei anlegen …
            </ModalButton>
            <ModalButton onClick={onOpenExisting}>
              Bestehende Datei öffnen …
            </ModalButton>
          </div>
        )}

        {showExport && (
          <ModalButton variant={supported ? 'default' : 'primary'} onClick={onExport}>
            {exported ? 'Backup gespeichert ✓' : 'Jetzt exportieren (Backup)'}
          </ModalButton>
        )}

        {!supported && (
          <p className="text-text-muted text-[12px] leading-relaxed">
            Eine <strong>lebende Datei</strong> (laufende Sicherung direkt in eine
            Datei) gibt es nur in Chrome oder Edge. In diesem Browser sicherst du
            per Export — und liest die Datei bei Bedarf über „Importieren" wieder
            ein.
          </p>
        )}

        {!isWarning && (
          <label className="text-text-muted flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={dismiss}
              onChange={(e) => setDismiss(e.target.checked)}
              className="accent-[color:var(--color-accent)]"
            />
            Nicht mehr anzeigen
          </label>
        )}
      </div>
    </Modal>
  )
}
