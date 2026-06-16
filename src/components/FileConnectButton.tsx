import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/StoreProvider'

/**
 * Schnellzugang Kopfzeile: lebende Datei (Weg B) verbinden/trennen — ohne Umweg
 * über die Einstellungen. Nutzt die bestehenden Store-Funktionen, kein neuer Pfad.
 *
 * Zustands-Logik (abgestimmt mit Save-Indikator + Reconnect-Band, damit sich die
 * drei in der Kopfzeile nicht doppeln):
 *  - 'unsupported'              → ausgegrauter Button + Hinweis (nur Chromium).
 *  - 'none'                     → „Verbinden" öffnet ein Menü mit beiden Flows
 *                                 (neue Datei anlegen / bestehende öffnen).
 *  - 'connected'               → „Trennen" mit Warn-Rückfrage (kein stiller
 *                                 Wechsel in den flüchtigen Browser-Speicher).
 *  - 'needs-reconnect'/'error' → ausgeblendet: das Reconnect-Band besitzt hier
 *                                 die Wiederverbinden-Aktion (keine Doppelung).
 */
export function FileConnectButton() {
  const { fileStatus, connectNewFile, openExistingFile, disconnectFile } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Menü bei Klick außerhalb oder Esc schließen.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // Wiederverbinden gehört dem Reconnect-Band — hier nichts zeigen.
  if (fileStatus === 'needs-reconnect' || fileStatus === 'error') return null

  const baseBtn =
    'text-text-muted hover:text-text hover:border-accent border-border bg-surface-2 inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-default disabled:opacity-40 disabled:hover:border-[color:var(--color-border)] disabled:hover:text-text-muted'

  if (fileStatus === 'unsupported') {
    return (
      <button
        type="button"
        disabled
        aria-label="Datei verbinden"
        title="Lebende Datei nur in Chrome oder Edge verfügbar (Weg B). Sichere über den Backup-Button."
        className={baseBtn}
      >
        <LinkIcon />
      </button>
    )
  }

  if (fileStatus === 'connected') {
    const onDisconnect = () => {
      if (
        window.confirm(
          'Verbindung zur Datei trennen?\n\n' +
            'Danach speichert PAKS nur noch im Browser (flüchtig) — bei ' +
            '„Browserdaten löschen" gehen die Daten verloren. Sichere vorher ' +
            'über eine verbundene Datei oder einen Export (Backup-Button).',
        )
      ) {
        void disconnectFile()
      }
    }
    return (
      <button
        type="button"
        onClick={onDisconnect}
        aria-label="Datei trennen"
        title="Lebende Datei trennen (Weg B)"
        className={baseBtn}
      >
        <UnlinkIcon />
      </button>
    )
  }

  // fileStatus === 'none' → Verbinden-Menü mit beiden bestehenden Flows.
  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Datei verbinden"
        title="Lebende Datei verbinden (Weg B)"
        className={baseBtn}
      >
        <LinkIcon />
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="border-border bg-surface absolute top-full right-0 z-50 mt-1 w-56 overflow-hidden rounded-[var(--radius-card)] border shadow-lg"
        >
          <MenuItem
            onClick={() => {
              setMenuOpen(false)
              void connectNewFile()
            }}
          >
            Neue Datendatei anlegen …
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMenuOpen(false)
              void openExistingFile()
            }}
          >
            Bestehende Datei öffnen …
          </MenuItem>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="text-text hover:bg-surface-2 block w-full px-3 py-2 text-left text-[13px] transition-colors"
    >
      {children}
    </button>
  )
}

function LinkIcon() {
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
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function UnlinkIcon() {
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
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 0 1 4 8" />
      <line x1="8" y1="12" x2="12" y2="12" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}
