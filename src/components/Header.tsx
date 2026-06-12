import type { Theme } from '@/lib/types'

/**
 * Kopfzeile: Wortmarke mit aufgelöstem Untertitel, zentrales Suchfeld, rechts
 * der Theme-Umschalter und die Aktions-Buttons. Die Aktionen (Galerie, Diashow,
 * Notiz, Fall hinzufügen) sind als Callbacks vorbereitet, aber in diesem Schritt
 * noch nicht verdrahtet — die zugehörige Logik folgt später.
 */
export function Header({
  query,
  onQueryChange,
  caseSensitive,
  onToggleCaseSensitive,
  theme,
  onToggleTheme,
  onOpenSettings,
  onOpenImport,
  onAddCase,
  onAddNote,
  onOpenGallery,
  onOpenSlideshow,
}: {
  query: string
  onQueryChange: (q: string) => void
  caseSensitive: boolean
  onToggleCaseSensitive: () => void
  theme: Theme
  onToggleTheme: () => void
  onOpenSettings?: () => void
  onOpenImport?: () => void
  onAddCase?: () => void
  onAddNote?: () => void
  onOpenGallery?: () => void
  onOpenSlideshow?: () => void
}) {
  return (
    <header className="bg-surface border-border flex shrink-0 items-center gap-4 border-b px-5 py-2.5">
      <div className="text-accent text-[15px] font-bold tracking-[0.04em] whitespace-nowrap">
        PA<span className="text-text-muted font-normal">KS</span>
      </div>
      <div className="text-text-muted -ml-2 text-[10px] leading-tight whitespace-nowrap">
        Personal Archive
        <br />&amp; Knowledge System
      </div>

      <div className="relative max-w-[480px] flex-1">
        <svg
          className="text-text-muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            // Esc leert das Suchfeld (und setzt die Ergebnisliste zurück).
            if (e.key === 'Escape' && query) {
              e.preventDefault()
              onQueryChange('')
            }
          }}
          placeholder="Diagnose, Region, Modalität, Notizen …"
          autoComplete="off"
          spellCheck={false}
          className={[
            'bg-bg border-border text-text focus:border-accent w-full rounded-[var(--radius-card)] border py-1.5 pl-8 text-[13px] outline-none transition-colors',
            query ? 'pr-8' : 'pr-3',
          ].join(' ')}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Suche leeren"
            title="Suche leeren (Esc)"
            className="text-text-muted hover:text-text absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-base leading-none transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleCaseSensitive}
        aria-pressed={caseSensitive}
        title={
          caseSensitive
            ? 'Groß-/Kleinschreibung beachten: an'
            : 'Groß-/Kleinschreibung beachten: aus'
        }
        aria-label="Groß-/Kleinschreibung in der Suche umschalten"
        className={[
          'inline-flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-card)] border text-[13px] font-semibold transition-colors',
          caseSensitive
            ? 'bg-accent border-accent text-white'
            : 'bg-surface-2 border-border text-text-muted hover:text-text hover:border-accent',
        ].join(' ')}
      >
        Aa
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln'}
          aria-label="Farbschema umschalten"
          className="bg-surface-2 border-border text-text-muted hover:text-text hover:border-accent inline-flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-card)] border transition-colors"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          title="Tag-Gruppen verwalten"
          aria-label="Einstellungen"
          className="bg-surface-2 border-border text-text-muted hover:text-text hover:border-accent inline-flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-card)] border transition-colors"
        >
          <GearIcon />
        </button>
        <ActionButton onClick={onOpenImport}>
          <ImportIcon /> Import
        </ActionButton>
        <ActionButton onClick={onOpenGallery}>
          <GalleryIcon /> Stichwort-Galerie
        </ActionButton>
        <ActionButton onClick={onOpenSlideshow}>
          <PlayIcon /> Diashow
        </ActionButton>
        <ActionButton onClick={onAddNote}>
          <NoteIcon /> Notiz
        </ActionButton>
        <ActionButton primary onClick={onAddCase}>
          <PlusIcon /> Fall hinzufügen
        </ActionButton>
      </div>
    </header>
  )
}

function ActionButton({
  primary = false,
  onClick,
  children,
}: {
  primary?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] whitespace-nowrap transition-colors',
        primary
          ? 'bg-accent border-accent hover:bg-accent-hover text-white'
          : 'bg-surface-2 border-border text-text hover:border-accent',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

function ImportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function GalleryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
