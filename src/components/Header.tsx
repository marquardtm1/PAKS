/**
 * Schmale Kopfzeile: nur noch die Wortmarke mit aufgelöstem Untertitel
 * („PA·KS – Personal Archive & Knowledge System"). Suche, Aktionen, Werkzeuge
 * und Einstellungen liegen seit der Sidebar-Reorganisation alle in der
 * Seitenleiste; der Header trägt bewusst nur noch die Marke (Auflösung der
 * Wortmarke ist Pflicht zur Abgrenzung von gleichnamigen Fremd-Apps).
 */
export function Header() {
  return (
    <header className="bg-surface border-border flex shrink-0 items-center gap-3 border-b px-5 py-2.5">
      <div className="text-accent text-[15px] font-bold tracking-[0.04em] whitespace-nowrap">
        PA<span className="text-text-muted font-normal">KS</span>
      </div>
      <div className="text-text-muted text-[10px] leading-tight whitespace-nowrap">
        Personal Archive
        <br />&amp; Knowledge System
      </div>
    </header>
  )
}
