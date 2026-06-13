import type { FileStatus } from '@/store/StoreProvider'

/**
 * Band für die lebende Datei (Weg B), sichtbar bei:
 *  - needs-reconnect: nach Reload bekannt, aber Schreibrecht muss per Klick neu
 *    erteilt werden (Eigenheit der File System Access API — geht nicht ohne Geste).
 *  - error: letzter Schreibvorgang scheiterte (z. B. Stick abgezogen). Wichtig:
 *    die Daten sind NICHT verloren — der IndexedDB-Spiegel hält den Stand; das
 *    Band bietet nur das erneute Verbinden an.
 *
 * Bei allen anderen Zuständen rendert die Komponente nichts.
 */
export function FileReconnectBanner({
  status,
  fileName,
  fileError,
  onReconnect,
}: {
  status: FileStatus
  fileName: string | null
  fileError: string | null
  onReconnect: () => void
}) {
  if (status !== 'needs-reconnect' && status !== 'error') return null

  const isError = status === 'error'
  const name = fileName ? `„${fileName}"` : 'die Datendatei'

  return (
    <div className="border-warning/40 bg-warning/10 flex items-start gap-3 border-b px-5 py-2.5 text-[13px]">
      <span className="shrink-0 text-base">{isError ? '⚠️' : '🔌'}</span>
      <div className="text-text flex-1 leading-relaxed">
        {isError ? (
          <>
            <strong>Speicherung in {name} unterbrochen.</strong> Deine Daten sind
            sicher im lokalen Speicher — neu verbinden, um wieder live in die Datei
            zu schreiben.
            {fileError && (
              <span className="text-text-muted block text-[12px] opacity-80">
                {fileError}
              </span>
            )}
          </>
        ) : (
          <>
            <strong>Datendatei wieder verbinden.</strong> Nach einem Neustart muss
            das Schreibrecht für {name} einmal per Klick erneut erteilt werden.
            Bis dahin läuft die App aus dem lokalen Speicher.
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onReconnect}
        className="bg-surface-2 border-border text-text hover:border-accent shrink-0 self-center rounded-[var(--radius-card)] border px-3 py-1 text-[12px] transition-colors"
      >
        {isError ? 'Erneut verbinden' : 'Verbinden'}
      </button>
    </div>
  )
}
