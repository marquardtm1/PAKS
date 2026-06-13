import { useEffect, useRef, useState } from 'react'
import type { Case, TagGroup } from '@/lib/types'
import { caseChips } from '@/lib/tags'
import { normalizeVideoPath, toFileUrl } from '@/lib/video'
import { TagChip } from './TagChip'

/**
 * Vollbild-Ansicht eines Falls (PowerPoint-artig). Öffnet sich beim Klick auf
 * eine Kachel und bleibt im aktuell gefilterten Set: Pfeiltasten ←/→ (und die
 * Klick-Pfeile am Rand) blättern zum vorherigen/nächsten Fall, Esc schließt
 * zurück zur Übersicht.
 *
 * Aufbau von oben nach unten: Titel (Kopfzeile mit Aktionen) · großes Bild ·
 * Kategorie-Chips · aufklappbares Notizfeld ganz unten. Das Notizfeld klappt
 * per Klick auf die Kopfzeile auf/zu (bewusst kein Hover — das flackerte beim
 * Größenwechsel). Der Anfangszustand kommt aus den Einstellungen
 * (notesExpandedByDefault) und ist danach pro Ansicht frei umschaltbar.
 */
export function Lightbox({
  cases,
  index,
  tagGroups,
  notesDefaultOpen,
  onIndexChange,
  onEdit,
  onDelete,
  onClose,
}: {
  cases: Case[]
  index: number
  tagGroups: TagGroup[]
  notesDefaultOpen: boolean
  onIndexChange: (i: number) => void
  onEdit: (c: Case) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const c = cases[index]
  const hasPrev = index > 0
  const hasNext = index < cases.length - 1
  const [notesOpen, setNotesOpen] = useState(notesDefaultOpen)
  const rootRef = useRef<HTMLDivElement>(null)
  // Cooldown gegen Über-Springen: ein einzelner Trackpad-/Wheel-„Schwung"
  // feuert viele kleine deltaY-Events — wir blättern höchstens einmal je Fenster.
  const wheelLockRef = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1)
      else if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, hasPrev, hasNext, onClose, onIndexChange])

  // Mausrad blättert wie ←/→ im aktuell gefilterten Set.
  //
  // Konflikt mit einem späteren Lightbox-Zoom: Das blanke Rad ist die einzige
  // Geste, die Navigation UND Zoom natürlich beanspruchen. Lösung: Navigation
  // ignoriert Strg/Cmd+Rad bewusst (`return` unten) und reserviert es so für
  // den Zoom. Kommt der Zoom, ist die Umstellung ein Einzeiler an genau dieser
  // Stelle — blankes Rad → Zoom, und die `deltaY`-Navigation wandert hinter ein
  // `if (e.ctrlKey || e.metaKey)`. Bis dahin bleibt blankes Rad = blättern.
  //
  // Listener am Wurzel-Element (nicht document) und non-passive, damit
  // preventDefault das Hintergrund-Scrollen unterbindet — scrollbare
  // Innenbereiche (Notizen/Text) sind per [data-scrollable] ausgenommen.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return
      const target = e.target as HTMLElement
      if (target.closest('[data-scrollable]')) return
      if (Math.abs(e.deltaY) < 1) return
      e.preventDefault()
      const now = Date.now()
      if (now < wheelLockRef.current) return
      wheelLockRef.current = now + 250
      if (e.deltaY > 0 && hasNext) onIndexChange(index + 1)
      else if (e.deltaY < 0 && hasPrev) onIndexChange(index - 1)
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [index, hasPrev, hasNext, onIndexChange])

  // Set kann sich unter der Ansicht ändern (Filter/Löschen) — der Aufrufer
  // klemmt den Index, hier nur defensiv abfangen.
  if (!c) return null

  const chips = caseChips(c, tagGroups)
  const hasNotes = c.notes.trim() !== ''

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Kopfzeile: zentrierter Titel, Aktionen rechts (linker Spacer balanciert
          die Zentrierung aus, damit der Titel wirklich mittig sitzt). */}
      <div className="flex shrink-0 items-center gap-3 px-5 py-3.5">
        <div className="flex-1" />
        <h2 className="max-w-[55%] text-center text-lg font-semibold break-words whitespace-normal text-white">
          {c.title || '(ohne Titel)'}
        </h2>
        <div className="flex flex-1 items-center justify-end gap-3">
          <span className="text-text-muted shrink-0 text-xs tabular-nums">
            {index + 1} / {cases.length}
          </span>
          <button
            type="button"
            onClick={() => onEdit(c)}
            className="bg-surface-2 border-border text-text hover:border-accent shrink-0 rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] transition-colors"
          >
            Bearbeiten
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Fall wirklich löschen?')) onDelete(c.id)
            }}
            className="bg-surface-2 border-border text-text-muted hover:border-danger hover:text-danger shrink-0 rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] transition-colors"
          >
            Löschen
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="text-text-muted hover:text-text shrink-0 px-1.5 text-2xl leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Bildbereich mit seitlichen Navigationspfeilen */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16">
        <NavArrow
          side="left"
          disabled={!hasPrev}
          onClick={() => onIndexChange(index - 1)}
        />

        {c.image ? (
          <img
            src={c.image}
            alt={c.title}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div
            data-scrollable
            className="max-h-full max-w-[640px] overflow-y-auto px-2 text-[16px] leading-relaxed whitespace-pre-wrap text-white"
          >
            {c.notes.trim() || c.description.trim() || '(kein Text)'}
          </div>
        )}

        <NavArrow
          side="right"
          disabled={!hasNext}
          onClick={() => onIndexChange(index + 1)}
        />
      </div>

      {/* Video-Zugang (nur Video-Fälle): Pfad + Abspielen/Kopieren. */}
      {c.videoPath && (
        <div className="mx-auto w-full max-w-[1000px] shrink-0 px-5 pt-2">
          <VideoAccess path={c.videoPath} />
        </div>
      )}

      {/* Fußbereich: Kategorie-Chips, darunter das aufklappbare Notizfeld */}
      {(chips.length > 0 || (c.image && hasNotes)) && (
        <div className="mx-auto w-full max-w-[1000px] shrink-0 px-5 pb-4">
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 py-3">
              {chips.map((chip, i) => (
                <TagChip key={i} chip={chip} />
              ))}
            </div>
          )}

          {/* Notizfeld nur bei Bild-Fällen mit Notiz — bei reinen Notizen ist der
              Text bereits der zentrale Inhalt oben. */}
          {c.image && hasNotes && (
            <div className="border-border/50 border-t">
              <button
                type="button"
                onClick={() => setNotesOpen((v) => !v)}
                aria-expanded={notesOpen}
                className="text-text-muted hover:text-text flex w-full items-center gap-2 py-2.5 text-left text-[13px] font-semibold tracking-[0.04em] uppercase transition-colors"
              >
                <span className="text-xs">{notesOpen ? '▾' : '▸'}</span>
                📝 Notizen
              </button>
              {notesOpen && (
                <div
                  data-scrollable
                  className="max-h-[30vh] overflow-y-auto pb-3 text-[16px] leading-relaxed whitespace-pre-wrap text-white"
                >
                  {c.notes}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Video-Zugang im Detail: Pfad-Feld + zwei Knöpfe. „Abspielen" ist Best-Effort
 * (window.open auf file:// — von Chromium aus http/localhost meist blockiert);
 * „Kopieren" ist der verlässliche Weg (Pfad → Explorer/Finder einfügen). Der
 * Pfad-bricht-Hinweis bleibt bewusst dezent.
 */
function VideoAccess({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Defensive Säuberung — auch falls ein Altbestand-Pfad noch Quotes trägt.
  const clean = normalizeVideoPath(path)

  const play = () => {
    window.open(toFileUrl(clean), '_blank', 'noopener')
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clean)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard-API nicht verfügbar/erlaubt → Pfad markieren, Strg+C dem Nutzer.
      inputRef.current?.select()
    }
  }

  return (
    <div className="border-border/50 border-t pt-2.5">
      <div className="text-text-muted mb-1.5 flex items-center gap-2 text-[13px] font-semibold tracking-[0.04em] uppercase">
        🎬 Video
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          readOnly
          value={clean}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Pfad zur Videodatei"
          className="bg-bg border-border text-text min-w-[200px] flex-1 rounded-[var(--radius-card)] border px-2.5 py-1.5 font-mono text-[12px] outline-none"
        />
        <button
          type="button"
          onClick={play}
          className="bg-surface-2 border-border text-text hover:border-accent inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] transition-colors"
        >
          ▶ Abspielen
        </button>
        <button
          type="button"
          onClick={copy}
          className="bg-surface-2 border-border text-text hover:border-accent inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] transition-colors"
        >
          {copied ? 'Kopiert ✓' : 'Kopieren'}
        </button>
      </div>
      <p className="text-text-muted mt-1.5 text-[11px] leading-relaxed opacity-70">
        „Abspielen" kann je nach Browser blockiert sein — dann „Kopieren" und im
        Explorer/Finder einfügen. Pfad bricht bei Verschieben/Umbenennen.
      </p>
    </div>
  )
}

function NavArrow({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={side === 'left' ? 'Vorheriger Fall' : 'Nächster Fall'}
      className={[
        'absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-3xl leading-none transition-colors',
        side === 'left' ? 'left-2' : 'right-2',
        disabled
          ? 'text-text-muted cursor-default opacity-20'
          : 'text-text-muted hover:bg-surface-2 hover:text-text',
      ].join(' ')}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  )
}
