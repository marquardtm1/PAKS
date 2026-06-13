import { useEffect, useRef, useState } from 'react'
import type { Case, Settings, SlideshowOrder, TagGroup } from '@/lib/types'
import { caseChips } from '@/lib/tags'
import { TagChip } from './TagChip'

/**
 * Diashow — zentraler Lern-Modus, eigener Vollbild-Modus (baut auf der Optik der
 * Lightbox auf). Läuft über das beim Öffnen eingefrorene, bild-only Set des
 * aktuell gefilterten/sortierten Bestands.
 *
 * Zwei unabhängige Sichtbarkeits-Begriffe halten den „Aufdecken"-Mechanismus
 * sauber:
 *  - metaMode ('visible' | 'hidden'): persistente Wahl für die ganze Show.
 *  - revealed: transient pro Bild, nur in 'hidden' relevant; wird bei jeder
 *    Navigation zurückgesetzt (nächstes Bild ist wieder verborgen).
 *
 * Space-Regel (eindeutig nach Zustand): ist gerade etwas zu enthüllen
 * (hidden & !revealed) → aufdecken + Auto pausieren; sonst → Play/Pause.
 */
export function Slideshow({
  cases,
  tagGroups,
  settings,
  updateSettings,
  onClose,
}: {
  cases: Case[]
  tagGroups: TagGroup[]
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  onClose: () => void
}) {
  const n = cases.length

  // Persistierte Modus-Wahl liegt in den Settings; Änderungen schreiben direkt
  // durch (gemerkt fürs nächste Mal).
  const orderMode = settings.slideshowOrder
  const metaMode: 'visible' | 'hidden' = settings.slideshowMetaHidden
    ? 'hidden'
    : 'visible'
  const intervalSec = settings.slideshowIntervalSec
  const autoDrill = settings.slideshowAutoDrill

  // order = Permutation der Indizes (grid = Identität, shuffle = Mischung). pos =
  // Position darin. So gilt „jeder Fall einmal vor Wiederholung" automatisch.
  const [order, setOrder] = useState<number[]>(() => buildOrder(orderMode, n))
  const [pos, setPos] = useState(0)
  const [revealed, setRevealed] = useState(false)
  // Immer pausiert starten (auch nach einem früheren Auto-Lauf + Esc): die Show
  // soll beim Öffnen nie mitten im Lauf sein.
  const [playing, setPlaying] = useState(false)
  // true, sobald das Set einmal komplett durchgesehen ist (Ende erreicht) →
  // anhalten statt endlos loopen.
  const [finished, setFinished] = useState(false)
  const [notesOpen, setNotesOpen] = useState(settings.notesExpandedByDefault)

  const rootRef = useRef<HTMLDivElement>(null)
  const wheelLockRef = useRef(0)

  // Reihenfolge-Modus (oder Set-Größe) gewechselt → Permutation neu bauen und an
  // den Anfang springen (Bild wieder verborgen, Durchlauf zurückgesetzt).
  useEffect(() => {
    setOrder(buildOrder(orderMode, n))
    setPos(0)
    setRevealed(false)
    setFinished(false)
  }, [orderMode, n])

  const caseIndex = order[pos] ?? 0
  const current: Case | undefined = cases[caseIndex]
  const metaShown = metaMode === 'visible' || revealed

  // ── Navigation ────────────────────────────────────────────────────────────
  // Weiter: nächste Position. Am Ende des Durchlaufs NICHT loopen, sondern
  // anhalten (finished) — bei Shuffle gilt das nach einem vollständigen Durchlauf.
  const advance = () => {
    setRevealed(false)
    if (pos + 1 < order.length) {
      setPos(pos + 1)
    } else {
      setPlaying(false)
      setFinished(true)
    }
  }
  const back = () => {
    if (pos === 0) return
    setRevealed(false)
    setFinished(false)
    setPos(pos - 1)
  }

  // Von vorn beginnen (nach „fertig" oder per Knopf): bei Shuffle frisch mischen.
  const restart = () => {
    setOrder(buildOrder(orderMode, n))
    setPos(0)
    setRevealed(false)
    setFinished(false)
  }

  // Manuelle Navigation pausiert den Auto-Modus (lokal).
  const navManual = (dir: 1 | -1) => {
    setPlaying(false)
    if (dir === 1) advance()
    else back()
  }

  const reveal = () => setRevealed(true)

  // Explizites Play/Pause. Ist die Show fertig, beginnt Play von vorn.
  const togglePlay = () => {
    if (finished) {
      restart()
      setPlaying(true)
      return
    }
    setPlaying(!playing)
  }

  // ── Auto-Timer ──────────────────────────────────────────────────────────────
  // tickRef trägt stets die frische Logik; das Intervall wird nur bei
  // playing/intervalSec neu gesetzt (nicht bei jedem pos-Wechsel).
  const tickRef = useRef<() => void>(() => {})
  tickRef.current = () => {
    // Aufdeck-Drill: in 'hidden' erst auflösen, beim nächsten Tick weiter.
    if (autoDrill && metaMode === 'hidden' && !revealed) {
      setRevealed(true)
    } else {
      advance()
    }
  }
  useEffect(() => {
    if (!playing) return
    const ms = Math.max(2, Math.min(30, intervalSec)) * 1000
    const id = setInterval(() => tickRef.current(), ms)
    return () => clearInterval(id)
  }, [playing, intervalSec])

  // ── Tastatur ────────────────────────────────────────────────────────────────
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    // Leertaste IMMER zuerst und bedingungslos abfangen: preventDefault am
    // document (Bubble-Phase) unterbindet die native Aktion JEDES fokussierten
    // Bedienelements — also auch das Öffnen des Intervall-Dropdowns oder ein
    // erneutes Auslösen des zuletzt geklickten Knopfes. Damit steuert Space immer
    // die Diashow, egal worauf der Fokus liegt.
    if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') {
      e.preventDefault()
      // Die eine Regel: gibt es etwas aufzudecken → aufdecken + pausieren;
      // sonst Play/Pause.
      if (metaMode === 'hidden' && !revealed) {
        reveal()
        setPlaying(false)
      } else {
        togglePlay()
      }
      return
    }
    if (e.key === 'Escape') {
      onClose()
      return
    }
    // Übrige Tasten (Pfeile, h): in einem fokussierten Formularfeld (Intervall-
    // Select) die nativen Tasten lassen.
    const el = document.activeElement
    if (
      el &&
      (el.tagName === 'SELECT' ||
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA')
    ) {
      return
    }
    if (e.key === 'ArrowLeft') {
      navManual(-1)
    } else if (e.key === 'ArrowRight') {
      navManual(1)
    } else if (e.key === 'h' || e.key === 'H') {
      toggleMeta()
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyRef.current(e)
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // ── Mausrad (wie Lightbox: blanker Wheel blättert, mit Cooldown) ────────────
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
      navManual(e.deltaY > 0 ? 1 : -1)
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  })

  const toggleMeta = () => {
    const nextHidden = metaMode === 'visible'
    updateSettings({ slideshowMetaHidden: nextHidden })
    // Beim Wechsel in 'hidden' das aktuelle Bild wieder verbergen.
    if (nextHidden) setRevealed(false)
  }

  if (!current) return null

  const chips = metaShown ? caseChips(current, tagGroups) : []
  const hasNotes = current.notes.trim() !== ''
  const concealed = metaMode === 'hidden' && !revealed

  return (
    <div
      ref={rootRef}
      onMouseDown={(e) => {
        // Diashow-Chrome (Knöpfe) soll keinen Fokus fangen, damit Leertaste/Pfeile
        // global bei der Diashow bleiben und nicht versehentlich den zuletzt
        // geklickten Knopf erneut auslösen. Klicks feuern trotzdem; Textauswahl in
        // den Notizen (kein <button>) bleibt unberührt.
        const t = e.target as HTMLElement
        if (t.closest('button')) e.preventDefault()
      }}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
    >
      {/* Kopfzeile: Fortschritt links, Titel mittig (nur wenn Metadaten gezeigt),
          Schließen rechts. */}
      <div className="flex shrink-0 items-center gap-3 px-5 py-3.5">
        <span className="text-text-muted flex-1 text-xs tabular-nums">
          {pos + 1} / {n}
        </span>
        <h2 className="max-w-[55%] flex-1 text-center text-lg font-semibold break-words whitespace-normal text-white">
          {metaShown ? current.title || '(ohne Titel)' : ''}
        </h2>
        <div className="flex flex-1 items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Diashow beenden (Esc)"
            title="Beenden (Esc)"
            className="text-text-muted hover:text-text shrink-0 px-1.5 text-2xl leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Bildbereich mit Navigationspfeilen. Im verborgenen Zustand deckt ein
          Klick auf das Bild auf (aktiver Abruf: erst überlegen, dann auflösen). */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16">
        <NavArrow side="left" onClick={() => navManual(-1)} />

        <button
          type="button"
          onClick={concealed ? reveal : undefined}
          aria-label={concealed ? 'Metadaten aufdecken' : undefined}
          className={[
            'flex h-full w-full items-center justify-center',
            concealed ? 'cursor-pointer' : 'cursor-default',
          ].join(' ')}
        >
          <img
            src={current.image ?? undefined}
            alt={metaShown ? current.title : 'Diashow-Bild'}
            className="max-h-full max-w-full object-contain"
          />
        </button>

        <NavArrow side="right" onClick={() => navManual(1)} />

        {/* Aufdecken gehört zur Bild-Ebene und liegt ABSOLUT über dem Bild —
            erscheint/verschwindet ohne die Bedienleiste zu verschieben. */}
        {concealed && !finished && (
          <div className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={reveal}
              className="bg-accent border-accent hover:bg-accent-hover pointer-events-auto rounded-[var(--radius-card)] border px-4 py-1.5 text-[13px] font-medium text-white shadow-lg transition-colors"
            >
              Aufdecken
            </button>
            <span className="text-text-muted text-[12px]">
              Leertaste oder Klick aufs Bild
            </span>
          </div>
        )}

        {/* „Fertig"-Hinweis am Ende des Sets — dezent, mit Neustart/Beenden. */}
        {finished && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70">
            <div className="text-center">
              <div className="text-lg font-semibold text-white">Alle durchgesehen</div>
              <div className="text-text-muted mt-1 text-[13px]">
                {n} {n === 1 ? 'Bild' : 'Bilder'} · Ende des Sets
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={restart}
                className="bg-accent border-accent hover:bg-accent-hover rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors"
              >
                Von vorn
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-surface-2 border-border text-text hover:border-accent rounded-[var(--radius-card)] border px-3.5 py-1.5 text-[13px] transition-colors"
              >
                Beenden
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Metadaten (nur wenn gezeigt): Chips + aufklappbare Notizen — wie Lightbox. */}
      {metaShown && (chips.length > 0 || hasNotes) && (
        <div className="mx-auto w-full max-w-[1000px] shrink-0 px-5 pb-2">
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 py-2">
              {chips.map((chip, i) => (
                <TagChip key={i} chip={chip} />
              ))}
            </div>
          )}
          {hasNotes && (
            <div className="border-border/50 border-t">
              <button
                type="button"
                onClick={() => setNotesOpen((v) => !v)}
                aria-expanded={notesOpen}
                className="text-text-muted hover:text-text flex w-full items-center gap-2 py-2 text-left text-[13px] font-semibold tracking-[0.04em] uppercase transition-colors"
              >
                <span className="text-xs">{notesOpen ? '▾' : '▸'}</span>
                📝 Notizen
              </button>
              {notesOpen && (
                <div
                  data-scrollable
                  className="max-h-[24vh] overflow-y-auto pb-2 text-[16px] leading-relaxed whitespace-pre-wrap text-white"
                >
                  {current.notes}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ControlBar
        playing={playing}
        onTogglePlay={togglePlay}
        intervalSec={intervalSec}
        onIntervalChange={(s) => updateSettings({ slideshowIntervalSec: s })}
        orderMode={orderMode}
        onOrderChange={(o) => updateSettings({ slideshowOrder: o })}
        metaHidden={metaMode === 'hidden'}
        onToggleMeta={toggleMeta}
        autoDrill={autoDrill}
        onAutoDrillChange={(d) => updateSettings({ slideshowAutoDrill: d })}
      />
    </div>
  )
}

/** Untere Bedienleiste: die drei Optionen + Play/Pause + Intervall. Das Aufdecken
 *  liegt bewusst NICHT hier, sondern als Overlay auf der Bild-Ebene (kein Sprung). */
function ControlBar({
  playing,
  onTogglePlay,
  intervalSec,
  onIntervalChange,
  orderMode,
  onOrderChange,
  metaHidden,
  onToggleMeta,
  autoDrill,
  onAutoDrillChange,
}: {
  playing: boolean
  onTogglePlay: () => void
  intervalSec: number
  onIntervalChange: (s: number) => void
  orderMode: SlideshowOrder
  onOrderChange: (o: SlideshowOrder) => void
  metaHidden: boolean
  onToggleMeta: () => void
  autoDrill: boolean
  onAutoDrillChange: (d: boolean) => void
}) {
  return (
    <div className="border-border/60 bg-surface/80 shrink-0 border-t backdrop-blur">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5 py-2.5 text-[13px]">
        {/* Auto/Manuell + Intervall */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-pressed={playing}
            title={playing ? 'Pause' : 'Auto-Wiedergabe'}
            className="bg-surface-2 border-border text-text hover:border-accent inline-flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-card)] border transition-colors"
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <label className="text-text-muted flex items-center gap-1.5">
            <span>Intervall</span>
            <select
              value={intervalSec}
              onChange={(e) => {
                onIntervalChange(Number(e.target.value))
                // Fokus nicht am Select kleben lassen — sonst fingen Pfeiltasten
                // dort an, den Wert zu ändern.
                e.currentTarget.blur()
              }}
              className="bg-bg border-border text-text focus:border-accent rounded-[var(--radius-card)] border px-1.5 py-1 outline-none"
            >
              {[2, 3, 5, 8, 10, 15, 20, 30].map((s) => (
                <option key={s} value={s}>
                  {s}s
                </option>
              ))}
            </select>
          </label>
        </div>

        <Divider />

        {/* Reihenfolge */}
        <Segmented
          label="Reihenfolge"
          value={orderMode}
          onChange={onOrderChange}
          options={[
            { value: 'grid', label: 'Wie im Grid' },
            { value: 'shuffle', label: 'Zufällig' },
          ]}
        />

        <Divider />

        {/* Metadaten */}
        <Segmented
          label="Metadaten"
          value={metaHidden ? 'hidden' : 'visible'}
          onChange={(v) => {
            if ((v === 'hidden') !== metaHidden) onToggleMeta()
          }}
          options={[
            { value: 'visible', label: 'Sichtbar' },
            { value: 'hidden', label: 'Verborgen' },
          ]}
        />

        {/* Auto-Verhalten nur relevant bei verborgenen Metadaten */}
        {metaHidden && (
          <>
            <Divider />
            <Segmented
              label="Auto"
              value={autoDrill ? 'drill' : 'flip'}
              onChange={(v) => onAutoDrillChange(v === 'drill')}
              options={[
                { value: 'flip', label: 'Durchblättern' },
                { value: 'drill', label: 'Aufdeck-Drill' },
              ]}
            />
          </>
        )}
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted">{label}</span>
      <div className="flex">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={[
              'border px-2.5 py-1 transition-colors',
              i === 0 ? 'rounded-l-[var(--radius-card)]' : 'rounded-r-[var(--radius-card)] border-l-0',
              value === opt.value
                ? 'bg-accent border-accent text-white'
                : 'bg-surface-2 border-border text-text-muted hover:text-text',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Divider() {
  return <span aria-hidden="true" className="bg-border hidden h-5 w-px sm:block" />
}

function NavArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Vorheriger Fall' : 'Nächster Fall'}
      className={[
        'text-text-muted hover:bg-surface-2 hover:text-text absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-3xl leading-none transition-colors',
        side === 'left' ? 'left-2' : 'right-2',
      ].join(' ')}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  )
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

// ── Reihenfolge-Helfer ────────────────────────────────────────────────────────

/** Identität (grid) oder gemischte Permutation (shuffle) der Indizes 0..n-1. */
function buildOrder(mode: SlideshowOrder, n: number): number[] {
  const ids = Array.from({ length: n }, (_, i) => i)
  return mode === 'shuffle' ? shuffle(ids) : ids
}

/** Fisher-Yates-Mischung (neue Liste). */
function shuffle(input: number[]): number[] {
  const a = [...input]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
