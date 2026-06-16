import { useStore } from '@/store/StoreProvider'
import { downloadSnapshot } from '@/lib/persistence/json'

/**
 * Schnell-Backup in der Kopfzeile: löst den bestehenden JSON-Export (Weg A,
 * derselbe wie „Daten & Backup" im Settings-Modal) mit einem Klick aus — ohne
 * Umweg über die Einstellungen. Kein neuer Export-Pfad, nur ein zusätzlicher
 * Auslöser für `downloadSnapshot`.
 *
 * Deaktiviert, sobald eine lebende Datei verbunden ist (Weg B, fileStatus
 * 'connected') — dort wird ohnehin laufend in die Datei geschrieben, ein
 * manuelles Backup ist redundant. In allen übrigen Zuständen (reiner Browser-/
 * IndexedDB-Betrieb sowie getrennte/fehlerhafte Datei, wo der Stand nur im
 * IndexedDB liegt) ist der Button aktiv.
 */
export function QuickBackupButton() {
  const { snapshot, fileStatus } = useStore()
  const connected = fileStatus === 'connected'
  const disabled = connected || !snapshot

  return (
    <button
      type="button"
      onClick={() => {
        if (snapshot) downloadSnapshot(snapshot)
      }}
      disabled={disabled}
      aria-label="Schnelles JSON-Backup herunterladen"
      title={
        connected
          ? 'Backup nicht nötig — lebende Datei verbunden (wird laufend gesichert)'
          : 'Schnelles JSON-Backup herunterladen (Weg A)'
      }
      className="text-text-muted hover:text-text hover:border-accent border-border bg-surface-2 inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-default disabled:opacity-40 disabled:hover:border-[color:var(--color-border)] disabled:hover:text-text-muted"
    >
      <DownloadIcon />
    </button>
  )
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
