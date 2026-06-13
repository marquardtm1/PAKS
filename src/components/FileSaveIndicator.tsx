import { useStore } from '@/store/StoreProvider'

/**
 * Kompakter Datei-Status in der Kopfzeile (Punkt + Kurztext). Zeigt nur etwas an,
 * wenn überhaupt eine Datei im Spiel ist (connected/needs-reconnect/error) — wer
 * Weg B nicht nutzt, sieht hier nichts (kein UI-Rauschen).
 *
 * Hauptzweck: erkennbar machen, wann ein Schreibvorgang läuft bzw. abgeschlossen
 * ist — damit man weiß, wann man den USB-Stick gefahrlos abziehen kann.
 */
export function FileSaveIndicator() {
  const { fileStatus, fileSaveState } = useStore()

  if (
    fileStatus !== 'connected' &&
    fileStatus !== 'needs-reconnect' &&
    fileStatus !== 'error'
  ) {
    return null
  }

  let color: string
  let label: string
  let pulse = false

  if (fileStatus === 'needs-reconnect') {
    color = '#d29922'
    label = 'Getrennt'
  } else if (fileStatus === 'error') {
    color = '#f85149'
    label = 'Schreibfehler'
  } else if (fileSaveState === 'saving') {
    color = '#d29922'
    label = 'Speichert …'
    pulse = true
  } else {
    color = '#3fb950'
    label = 'Gespeichert'
  }

  return (
    <div
      className="text-text-muted hidden items-center gap-1.5 text-[11px] sm:flex"
      title="Status der lebenden Datendatei"
    >
      <span
        aria-hidden="true"
        className={['inline-block h-2 w-2 rounded-full', pulse ? 'animate-pulse' : ''].join(' ')}
        style={{ background: color }}
      />
      <span className="whitespace-nowrap">{label}</span>
    </div>
  )
}
