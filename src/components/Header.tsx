import { useState } from 'react'
import { Modal } from './Modal'
import { FileSaveIndicator } from './FileSaveIndicator'

/**
 * Schmale Kopfzeile: links die Wortmarke (Kurzform groß + aufgelöster Untertitel
 * daneben, einzeilig), rechts ein Info-Knopf. Die Auflösung der Wortmarke
 * („PAKS – Personal Archive & Knowledge System") ist Pflicht zur Abgrenzung von
 * gleichnamigen Fremd-Apps.
 *
 * Einzeilig + Auflösung: Kurzform „PAKS" groß (Akzent), rechts daneben in einer
 * Zeile der ausgeschriebene Name kleiner und gedämpft, abgesetzt durch einen
 * dünnen Trenner. In schmaler Ansicht (zu wenig Platz) wird die Auflösung per
 * `hidden sm:flex` ausgeblendet, statt umzubrechen — die Kurzmarke bleibt immer
 * lesbar. Der spätere Platz für ein Header-Bild liegt zwischen Marke (links) und
 * Info-Knopf (rechts): der flexible Mittelbereich (`flex-1`) ist dafür frei.
 */
export function Header() {
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <header className="bg-surface border-border flex shrink-0 items-center gap-3 border-b px-5 py-2">
      {/* Wortmarke: Kurzform groß + Auflösung daneben, alles in einer Zeile. */}
      <div className="flex items-baseline gap-2.5 whitespace-nowrap">
        <span className="text-accent text-[22px] font-bold tracking-[0.04em] leading-none">
          PA<span className="text-text-muted font-semibold">KS</span>
        </span>
        <span
          aria-hidden="true"
          className="border-border hidden h-4 self-center border-l sm:block"
        />
        <span className="text-text-muted hidden text-[13px] leading-none sm:block">
          Personal Archive &amp; Knowledge System
        </span>
      </div>

      {/* Flexibler Mittelbereich — reserviert für ein späteres Header-Bild. */}
      <div className="min-w-0 flex-1" />

      <FileSaveIndicator />

      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        aria-label="Informationen zur App"
        title="Über PAKS"
        className="text-text-muted hover:text-text hover:border-accent border-border bg-surface-2 inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border transition-colors"
      >
        <InfoIcon />
      </button>

      {infoOpen && <InfoModal onClose={() => setInfoOpen(false)} />}
    </header>
  )
}

/** „Über PAKS" — Platzhalter-Inhalt; Texte werden später vom Urheber gefüllt. */
function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Über PAKS" onClose={onClose} maxWidth={480}>
      <div className="space-y-4 px-5 py-5 text-[13px] leading-relaxed">
        <div>
          <div className="text-text font-semibold">
            PAKS – Personal Archive &amp; Knowledge System
          </div>
          <p className="text-text-muted mt-1">
            {/* Platzhalter: Kurzbeschreibung der App (vom Urheber zu füllen). */}
            Lokal-first Bild- und Wissensarchiv für eigene Fallbilder.
          </p>
        </div>

        <div>
          <div className="text-text-muted text-[10px] font-semibold tracking-[0.1em] uppercase">
            Urheber &amp; Copyright
          </div>
          <p className="text-text mt-1">
            {/* Platzhalter: Name / Copyright-Zeile (vom Urheber zu füllen). */}
            © {new Date().getFullYear()} Michael Marquardt. Alle Rechte vorbehalten.
          </p>
        </div>

        <div>
          <div className="text-text-muted text-[10px] font-semibold tracking-[0.1em] uppercase">
            Version
          </div>
          <p className="text-text-muted mt-1">
            {/* Platzhalter: Versionsangabe (vom Urheber zu füllen). */}
            —
          </p>
        </div>
      </div>
    </Modal>
  )
}

function InfoIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}
