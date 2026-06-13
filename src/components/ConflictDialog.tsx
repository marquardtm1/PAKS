import type { FileConflict } from '@/store/StoreProvider'
import { Modal, ModalButton } from './Modal'

/**
 * Konflikt-Dialog beim Verbinden einer Datei, deren Inhalt vom aktuellen lokalen
 * Stand abweicht (z. B. die Stick-Datei wurde an einem anderen Rechner neuer
 * gespeichert). Zeigt beide Seiten mit Fallzahl + Speicherzeit und hebt die
 * neuere hervor, damit der Nutzer informiert entscheidet. Bewusst KEIN
 * automatisches Mergen — eine Seite gewinnt; die andere geht verloren, daher der
 * ausdrückliche Backup-Hinweis.
 */
export function ConflictDialog({
  conflict,
  onResolve,
}: {
  conflict: FileConflict
  onResolve: (choice: 'file' | 'local' | 'cancel') => void
}) {
  const fileNewer = isNewer(conflict.fileSavedAt, conflict.localSavedAt)
  const localNewer = isNewer(conflict.localSavedAt, conflict.fileSavedAt)

  return (
    <Modal
      title="Unterschiedlicher Stand"
      onClose={() => onResolve('cancel')}
      maxWidth={560}
      footer={
        <>
          <ModalButton onClick={() => onResolve('cancel')}>Abbrechen</ModalButton>
          <ModalButton onClick={() => onResolve('local')}>
            Lokalen Stand behalten
          </ModalButton>
          <ModalButton variant="primary" onClick={() => onResolve('file')}>
            Datei laden
          </ModalButton>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        <p className="text-text-muted text-[13px] leading-relaxed">
          Die Datei „{conflict.fileName}" unterscheidet sich vom aktuellen lokalen
          Stand. Wähle, welche Seite gilt — die andere wird dabei überschrieben.
          Exportiere im Zweifel vorher ein Backup (Weg A).
        </p>

        <div className="grid grid-cols-2 gap-3">
          <SideCard
            label="Datei"
            caseCount={conflict.fileCaseCount}
            savedAt={conflict.fileSavedAt}
            newer={fileNewer}
          />
          <SideCard
            label="Lokaler Stand"
            caseCount={conflict.localCaseCount}
            savedAt={conflict.localSavedAt}
            newer={localNewer}
          />
        </div>

        <p className="text-text-muted text-[12px] leading-relaxed opacity-80">
          „Datei laden" ersetzt deinen lokalen Stand durch den Datei-Inhalt.
          „Lokalen Stand behalten" überschreibt die Datei beim nächsten Speichern
          mit deinem aktuellen Stand.
        </p>
      </div>
    </Modal>
  )
}

function SideCard({
  label,
  caseCount,
  savedAt,
  newer,
}: {
  label: string
  caseCount: number
  savedAt: string | null
  newer: boolean
}) {
  return (
    <div
      className={[
        'rounded-[var(--radius-card)] border p-3',
        newer ? 'border-accent bg-accent/10' : 'border-border bg-surface-2',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className="text-text text-[13px] font-semibold">{label}</span>
        {newer && (
          <span className="text-accent text-[10px] font-semibold tracking-[0.08em] uppercase">
            neuer
          </span>
        )}
      </div>
      <div className="text-text mt-2 text-[13px]">
        {caseCount} {caseCount === 1 ? 'Fall' : 'Fälle'}
      </div>
      <div className="text-text-muted mt-0.5 text-[12px]">
        {savedAt ? `gespeichert ${formatWhen(savedAt)}` : 'Speicherzeit unbekannt'}
      </div>
    </div>
  )
}

/** ISO-Zeitstempel als deutsches Datum + Uhrzeit. */
function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'unbekannt'
  return date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

/** true, wenn `a` zeitlich nach `b` liegt (ISO-Strings sortieren lexikografisch). */
function isNewer(a: string | null, b: string | null): boolean {
  if (!a) return false
  if (!b) return true
  return a > b
}
