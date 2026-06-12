/**
 * Erststart-Hinweis: Datenschutz + USB-Stick-Risiko. Wird angezeigt, bis der
 * Nutzer bestätigt; die Bestätigung landet in den Settings (Teil des Snapshots).
 */
export function DisclaimerBanner({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="border-warning/40 bg-warning/10 flex items-start gap-3 border-b px-5 py-2.5 text-[13px]">
      <span className="shrink-0 text-base">⚠️</span>
      <div className="text-text flex-1 leading-relaxed">
        <strong>Nur anonymisierte Bilder.</strong> Lade keine Patientendaten
        hoch (keine Namen, Geburtsdaten, IDs im Bild). Deine Daten bleiben lokal —
        liegen sie auf einem USB-Stick, ist ein Verlust dein Risiko.
      </div>
      <button
        type="button"
        onClick={onAccept}
        className="bg-surface-2 border-border text-text hover:border-accent shrink-0 self-center rounded-[var(--radius-card)] border px-3 py-1 text-[12px] transition-colors"
      >
        Verstanden
      </button>
    </div>
  )
}
