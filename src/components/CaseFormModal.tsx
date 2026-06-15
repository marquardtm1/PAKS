import { useEffect, useRef, useState } from 'react'
import type { Case, Settings, TagGroup } from '@/lib/types'
import { cleanFilename, fileToDataUrl, splitFilename } from '@/lib/image'
import { extractVideoThumbnail, normalizeVideoPath } from '@/lib/video'
import { Modal, ModalButton } from './Modal'

/** Eingabedaten eines neuen Falls (ohne id/Zeitstempel — die setzt der Aufrufer). */
export type NewCaseInput = Pick<
  Case,
  | 'title'
  | 'description'
  | 'notes'
  | 'image'
  | 'groupValues'
  | 'freeTags'
  | 'fileModified'
  | 'videoPath'
  | 'videoData'
>

const inputClass =
  'bg-bg border-border text-text focus:border-accent w-full rounded-[var(--radius-card)] border px-2.5 py-2 text-[13px] outline-none transition-colors'
const labelClass =
  'text-text-muted mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em]'

/** Wie inputClass, aber mit roter Umrandung bei Validierungsfehler. */
function inputClassError(hasError: boolean): string {
  return [
    'bg-bg text-text w-full rounded-[var(--radius-card)] border px-2.5 py-2 text-[13px] outline-none transition-colors',
    hasError
      ? 'border-danger focus:border-danger'
      : 'border-border focus:border-accent',
  ].join(' ')
}

/** Kurzer roter Hinweistext unter einem Pflichtfeld; rendert nichts ohne Fehler. */
function FieldHint({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-danger mt-1 text-[11px] font-medium">{message}</p>
}

type FormRegister = 'case' | 'note' | 'video'

const REGISTER_TABS: { key: FormRegister; label: string }[] = [
  { key: 'case', label: '🩻 Bild' },
  { key: 'video', label: '🎬 Video' },
  { key: 'note', label: '📝 Notiz' },
]

/** Video-Untermodus: eingebettet (abspielbar) oder per Pfad referenziert. */
type VideoMode = 'embed' | 'reference'

/**
 * Ab dieser Dateigröße warnt das Einbetten deutlich (vergrößert die Datendatei,
 * verlangsamt Laden/Export) und empfiehlt den Pfad-Weg. Fortfahren bleibt
 * möglich. base64 trägt zusätzlich ~+33 % gegenüber der Originaldatei.
 */
const EMBED_WARN_BYTES = 50 * 1024 * 1024

/**
 * Anlege-/Bearbeiten-Formular mit drei Registern: Bild (mit Bild), Video
 * (Verweis + Vorschaubild) und Notiz (ohne Bild). Das aktive Register ist
 * interner Zustand und beim Wechsel verlustfrei: alle gemeinsamen Felder
 * (Titel, Beschreibung, Notizen, Tags) sowie Bild und Video-Pfad bleiben
 * erhalten; erst beim Speichern bestimmt das aktive Register die Endform des
 * Falls. `mode` ist nur das Start-Register (Default beim Neuanlegen: Bild;
 * beim Bearbeiten: das zum Fall passende Register). Tag-Gruppen werden
 * dynamisch aus tagGroups gerendert; pro Gruppe sind mehrere Werte wählbar.
 */
export function CaseFormModal({
  mode,
  tagGroups,
  settings,
  initial,
  onSubmit,
  onClose,
}: {
  mode: FormRegister
  tagGroups: TagGroup[]
  settings: Settings
  /** Vorhandener Fall zum Bearbeiten; gesetzt → Edit-Modus (Felder vorbefüllt). */
  initial?: Case
  onSubmit: (data: NewCaseInput) => void
  onClose: () => void
}) {
  // Aktives Register als interner Zustand → Tab-Wechsel ohne Datenverlust.
  const [register, setRegister] = useState<FormRegister>(mode)
  const isNote = register === 'note'
  const isVideo = register === 'video'
  const isEditing = initial != null
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [image, setImage] = useState<string | null>(initial?.image ?? null)
  const [filename, setFilename] = useState('')
  const [fileModified, setFileModified] = useState<number | undefined>(
    initial?.fileModified,
  )
  // Video-Fall: Untermodus + die zwei sich ausschließenden Datenträger.
  //  - embed:     videoData (Data-URL des Videos) ist die definierende Eigenschaft
  //  - reference: videoPath (manuell, Browser liest ihn nicht aus der Auswahl)
  // Start-Modus aus dem Bestandsfall ableiten (Pfad-Fall → reference), Default
  // beim Neuanlegen ist „einbetten".
  const [videoMode, setVideoMode] = useState<VideoMode>(
    initial?.videoPath && !initial?.videoData ? 'reference' : 'embed',
  )
  const [videoData, setVideoData] = useState<string | null>(
    initial?.videoData ?? null,
  )
  const [videoPath, setVideoPath] = useState(initial?.videoPath ?? '')
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [videoDragOver, setVideoDragOver] = useState(false)
  const videoPathRef = useRef<HTMLInputElement>(null)
  const embedDropRef = useRef<HTMLLabelElement>(null)
  const [groupValues, setGroupValues] = useState<Record<string, string[]>>(
    () => ({ ...(initial?.groupValues ?? {}) }),
  )
  const [freeTags, setFreeTags] = useState<string[]>(() => [
    ...(initial?.freeTags ?? []),
  ])
  const [tagInput, setTagInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
  // Erst nach einem Speicherversuch Pflichtfelder rot markieren (nicht vorher
  // anschreien). Die Fehler werden aus dem aktuellen Zustand abgeleitet, also
  // verschwindet eine Markierung, sobald das Feld ausgefüllt ist.
  const [showErrors, setShowErrors] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  async function handleFile(file: File | undefined | null) {
    if (!file || !file.type.startsWith('image/')) return
    const { title: splitTitle, notes: splitNotes } = splitFilename(file.name, {
      enabled: settings.filenameSplitEnabled,
      separator: settings.filenameSeparator,
    })
    setFilename(cleanFilename(file.name))
    setFileModified(file.lastModified || undefined)
    setImage(await fileToDataUrl(file))
    // Titel/Notizen aus dem Dateinamen vorbelegen, solange noch leer (nicht
    // überschreiben, falls der Nutzer bereits getippt hat).
    setTitle((prev) => (prev.trim() ? prev : splitTitle))
    setNotes((prev) => (prev.trim() ? prev : splitNotes))
  }

  // Vorschaubild im Video-Modus manuell setzen (Screenshot per Upload/Paste) —
  // ohne Titel/Notizen zu verändern (anders als handleFile im Bild-Modus).
  async function setThumbnailFromImage(file: File | undefined | null) {
    if (!file || !file.type.startsWith('image/')) return
    setImage(await fileToDataUrl(file))
    setExtractError(null)
  }

  // Videodatei EINBETTEN: ganze Datei als Data-URL in PAKS speichern (videoData)
  // + Standbild als Vorschau extrahieren. Vor dem Einbetten großer Dateien
  // deutlich warnen (Datendatei/Export). Der Nutzer kann trotzdem fortfahren.
  async function handleEmbedVideoFile(file: File | undefined | null) {
    if (!file || !file.type.startsWith('video/')) return
    if (file.size > EMBED_WARN_BYTES) {
      const mb = Math.round(file.size / (1024 * 1024))
      const ok = window.confirm(
        `Dieses Video ist ca. ${mb} MB groß.\n\n` +
          'Eingebettete Videos werden vollständig in der Datendatei gespeichert ' +
          '(base64, zusätzlich ~+33 %). Das vergrößert sie stark und verlangsamt ' +
          'Laden und Export.\n\n' +
          'Empfehlung: große Videos lieber „Per Pfad referenzieren".\n\n' +
          'Trotzdem einbetten?',
      )
      if (!ok) return
    }
    const { title: splitTitle } = splitFilename(file.name, {
      enabled: settings.filenameSplitEnabled,
      separator: settings.filenameSeparator,
    })
    setFilename(cleanFilename(file.name))
    setFileModified(file.lastModified || undefined)
    setTitle((prev) => (prev.trim() ? prev : splitTitle))
    setExtractError(null)
    setExtracting(true)
    try {
      setVideoData(await fileToDataUrl(file))
      // Thumbnail best-effort aus derselben Datei (Poster + Kachelvorschau).
      try {
        setImage(await extractVideoThumbnail(file))
      } catch {
        setExtractError(
          'Video eingebettet, aber automatische Vorschau nicht möglich (Format/Codec?). Bitte Vorschaubild unten manuell wählen.',
        )
      }
    } finally {
      setExtracting(false)
    }
  }

  // Videodatei wählen → frühen Frame als Thumbnail extrahieren (Best-Effort).
  // Scheitert die Extraktion (Format/Codec/Timeout), sauberer Hinweis → manuell.
  async function handleVideoFile(file: File | undefined | null) {
    if (!file) return
    const { title: splitTitle } = splitFilename(file.name, {
      enabled: settings.filenameSplitEnabled,
      separator: settings.filenameSeparator,
    })
    setFilename(cleanFilename(file.name))
    setFileModified(file.lastModified || undefined)
    setTitle((prev) => (prev.trim() ? prev : splitTitle))
    setExtractError(null)
    setExtracting(true)
    try {
      setImage(await extractVideoThumbnail(file))
    } catch {
      setExtractError(
        'Automatische Vorschau nicht möglich (Format/Codec?). Bitte Vorschaubild manuell wählen.',
      )
    } finally {
      setExtracting(false)
    }
  }

  // Clipboard-Paste: Screenshot direkt einfügen — als Bild (Fall) bzw. als
  // Vorschaubild (Video). Im reinen Notiz-Modus deaktiviert.
  useEffect(() => {
    if (isNote) return
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) {
            const file = new File([blob], blob.name || 'Screenshot', { type: blob.type })
            if (isVideo) void setThumbnailFromImage(file)
            else void handleFile(file)
            e.preventDefault()
          }
          break
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNote, isVideo])

  function addGroupValue(groupId: string, value: string) {
    if (!value) return
    setGroupValues((prev) => {
      const current = prev[groupId] ?? []
      if (current.includes(value)) return prev
      return { ...prev, [groupId]: [...current, value] }
    })
  }

  function removeGroupValue(groupId: string, value: string) {
    setGroupValues((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] ?? []).filter((v) => v !== value),
    }))
  }

  function addTag() {
    const v = tagInput.trim()
    if (v && !freeTags.includes(v)) setFreeTags((prev) => [...prev, v])
    setTagInput('')
  }

  // Fehlende Pflichtfelder je nach Register/Modus sammeln → field-key → Hinweis.
  // Bewusst aus dem aktuellen Zustand abgeleitet (kein eigener Fehler-State pro
  // Feld): füllt der Nutzer ein Feld, fällt der Eintrag beim nächsten Render weg.
  function collectErrors(): Record<string, string> {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Titel erforderlich'
    if (isVideo && videoMode === 'embed' && !videoData) {
      e.videoData = 'Videodatei zum Einbetten erforderlich'
    }
    if (isVideo && videoMode === 'reference' && !normalizeVideoPath(videoPath)) {
      e.videoPath = 'Pfad erforderlich'
    }
    // Als Pflicht markierte Tag-Gruppen (Stern im Label) brauchen ≥ 1 Wert.
    for (const group of tagGroups) {
      if (group.required && (groupValues[group.id]?.length ?? 0) === 0) {
        e[`group:${group.id}`] = `${group.name} erforderlich`
      }
    }
    return e
  }

  function submit() {
    const errors = collectErrors()
    if (Object.keys(errors).length > 0) {
      // Felder rot markieren statt still nichts zu tun; auf das erste fehlende
      // fokussierbare Feld springen (Gruppen werden nur visuell markiert).
      setShowErrors(true)
      if (errors.title) titleRef.current?.focus()
      else if (errors.videoData) embedDropRef.current?.focus()
      else if (errors.videoPath) videoPathRef.current?.focus()
      return
    }
    const trimmedPath = normalizeVideoPath(videoPath)
    const embedding = isVideo && videoMode === 'embed'
    const referencing = isVideo && videoMode === 'reference'
    // Notiz-Register speichert kein Bild — vor versehentlichem Bildverlust warnen.
    if (isNote && image) {
      const ok = window.confirm(
        'Im Notiz-Register wird kein Bild gespeichert — das eingefügte Bild geht verloren. Trotzdem als reine Notiz speichern?',
      )
      if (!ok) return
    }
    // Leere Gruppen-Arrays nicht mitschleppen.
    const cleanedGroups: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(groupValues)) {
      if (v.length) cleanedGroups[k] = v
    }
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      notes: notes.trim(),
      image: isNote ? null : image,
      groupValues: cleanedGroups,
      freeTags,
      fileModified: isNote ? undefined : fileModified,
      // Nur das Feld des aktiven Modus setzen, das andere bewusst auf undefined
      // — ein Video-Fall ist eindeutig entweder eingebettet ODER referenziert.
      videoPath: referencing ? trimmedPath : undefined,
      videoData: embedding ? (videoData ?? undefined) : undefined,
    })
    onClose()
  }

  const ordered = [...tagGroups].sort((a, b) => a.order - b.order)
  // Nach einem Speicherversuch live aus dem Zustand neu berechnet (siehe submit).
  const errors: Record<string, string> = showErrors ? collectErrors() : {}

  return (
    <Modal
      title={
        isEditing
          ? isVideo
            ? 'Video-Fall bearbeiten'
            : isNote
              ? 'Notiz bearbeiten'
              : 'Fall bearbeiten'
          : isVideo
            ? 'Neuer Video-Fall'
            : isNote
              ? 'Neue Notiz'
              : 'Neuer Fall'
      }
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>Abbrechen</ModalButton>
          <ModalButton variant="primary" onClick={submit}>
            Speichern
          </ModalButton>
        </>
      }
    >
      <div className="flex flex-col gap-3.5 p-5">
        {/* Register-Umschalter — Wechsel ist verlustfrei (siehe submit). */}
        <div className="bg-bg border-border flex gap-1 rounded-[var(--radius-card)] border p-1">
          {REGISTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setRegister(key)}
              aria-pressed={register === key}
              className={[
                'flex-1 rounded-[calc(var(--radius-card)-3px)] px-3 py-1.5 text-[13px] font-medium transition-colors',
                register === key
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {register === 'case' && (
          <div>
            <span className={labelClass}>Bild</span>
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                void handleFile(e.dataTransfer.files[0])
              }}
              className={[
                'block cursor-pointer rounded-[var(--radius-card)] border-2 border-dashed px-6 py-6 text-center transition-colors',
                dragOver ? 'border-accent bg-surface-2' : 'border-border',
              ].join(' ')}
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              <div className="mb-1 text-2xl">🩻</div>
              <div className="text-text-muted text-[13px]">
                Bild hierher ziehen, klicken oder <strong>Strg+V</strong> einfügen
              </div>
              <div className="text-text-muted mt-1 text-[11px]">
                Screenshot machen (Win+Shift+S / Cmd+Shift+4), dann Strg+V — bleibt lokal
              </div>
              {image && (
                <>
                  <img
                    src={image}
                    alt=""
                    className="mx-auto mt-2.5 max-h-[180px] rounded-[var(--radius-card)] object-contain"
                  />
                  {filename && (
                    <div className="text-accent mt-1.5 text-[11px]">
                      Dateiname: „{filename}"
                    </div>
                  )}
                </>
              )}
            </label>
          </div>
        )}

        {isVideo && (
          <>
            {/* Untermodus: einbetten (abspielbar) oder per Pfad referenzieren. */}
            <div className="bg-bg border-border flex gap-1 rounded-[var(--radius-card)] border p-1">
              {(
                [
                  { key: 'embed', label: '⬇ Video einbetten' },
                  { key: 'reference', label: '🔗 Per Pfad referenzieren' },
                ] as { key: VideoMode; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVideoMode(key)}
                  aria-pressed={videoMode === key}
                  className={[
                    'flex-1 rounded-[calc(var(--radius-card)-3px)] px-3 py-1.5 text-[12px] font-medium transition-colors',
                    videoMode === key
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:text-text',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>

            {videoMode === 'embed' ? (
              /* Einbetten: Videodatei wird in PAKS gespeichert + abspielbar. */
              <div>
                <span className={labelClass}>Videodatei einbetten</span>
                <label
                  ref={embedDropRef}
                  tabIndex={-1}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setVideoDragOver(true)
                  }}
                  onDragLeave={() => setVideoDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setVideoDragOver(false)
                    void handleEmbedVideoFile(e.dataTransfer.files[0])
                  }}
                  className={[
                    'block cursor-pointer rounded-[var(--radius-card)] border-2 border-dashed px-6 py-5 text-center transition-colors',
                    videoDragOver
                      ? 'border-accent bg-surface-2'
                      : errors.videoData
                        ? 'border-danger'
                        : 'border-border',
                  ].join(' ')}
                >
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => void handleEmbedVideoFile(e.target.files?.[0])}
                  />
                  {videoData ? (
                    <>
                      <video
                        src={videoData}
                        controls
                        className="mx-auto max-h-[200px] rounded-[var(--radius-card)] bg-black"
                      />
                      <div className="text-accent mt-2 text-[12px]">
                        ✓ Video eingebettet (~
                        {Math.round((videoData.length * 3) / 4 / (1024 * 1024))} MB)
                        — im Detail abspielbar. Andere Datei wählen zum Ersetzen.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mb-1 text-2xl">🎬</div>
                      <div className="text-text-muted text-[13px]">
                        {extracting
                          ? 'Video wird eingebettet …'
                          : 'Videodatei hierher ziehen oder klicken — sie wird in PAKS gespeichert und ist im Detail abspielbar'}
                      </div>
                      <div className="text-text-muted mt-1 text-[11px]">
                        Bleibt lokal. Große Videos (&gt; 50 MB) vergrößern die
                        Datendatei spürbar — dann lieber „Per Pfad referenzieren".
                      </div>
                    </>
                  )}
                </label>
                <FieldHint message={errors.videoData} />
              </div>
            ) : (
              <>
                {/* Referenzieren: nur Standbild lokal erzeugen, Video bleibt extern. */}
                <div>
                  <span className={labelClass}>Videodatei → Vorschaubild</span>
                  <label
                    onDragOver={(e) => {
                      e.preventDefault()
                      setVideoDragOver(true)
                    }}
                    onDragLeave={() => setVideoDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setVideoDragOver(false)
                      void handleVideoFile(e.dataTransfer.files[0])
                    }}
                    className={[
                      'block cursor-pointer rounded-[var(--radius-card)] border-2 border-dashed px-6 py-5 text-center transition-colors',
                      videoDragOver ? 'border-accent bg-surface-2' : 'border-border',
                    ].join(' ')}
                  >
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => void handleVideoFile(e.target.files?.[0])}
                    />
                    <div className="mb-1 text-2xl">🎬</div>
                    <div className="text-text-muted text-[13px]">
                      Videodatei hierher ziehen oder klicken — es wird ein Standbild
                      als Vorschau erzeugt
                    </div>
                    <div className="text-text-muted mt-1 text-[11px]">
                      Das Video wird <strong>nicht gespeichert</strong>, nur das
                      Vorschaubild. Den Pfad bitte unten eintragen.
                    </div>
                  </label>
                </div>

                {/* Pfad — manuell (Browser kann ihn nicht aus der Auswahl lesen). */}
                <div>
                  <label className={labelClass} htmlFor="cf-videopath">
                    Pfad zur Videodatei
                  </label>
                  <input
                    id="cf-videopath"
                    ref={videoPathRef}
                    className={inputClassError(!!errors.videoPath)}
                    value={videoPath}
                    onChange={(e) => setVideoPath(e.target.value)}
                    onBlur={() => setVideoPath((p) => normalizeVideoPath(p))}
                    placeholder={'z. B. C:\\Users\\…\\Vorlesung.mp4'}
                    spellCheck={false}
                  />
                  <FieldHint message={errors.videoPath} />
                  <p className="text-text-muted mt-1 text-[11px] leading-relaxed opacity-70">
                    Absoluter Pfad (in Windows per Rechtsklick → „Als Pfad
                    kopieren"). Bricht, wenn die Datei verschoben/umbenannt wird
                    oder auf einem anderen Rechner liegt.
                  </p>
                </div>
              </>
            )}

            {/* Vorschaubild: automatisch (oben) oder manuell überschreiben. */}
            <div>
              <span className={labelClass}>Vorschaubild</span>
              <label
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  void setThumbnailFromImage(e.dataTransfer.files[0])
                }}
                className={[
                  'block cursor-pointer rounded-[var(--radius-card)] border-2 border-dashed px-6 py-5 text-center transition-colors',
                  dragOver ? 'border-accent bg-surface-2' : 'border-border',
                ].join(' ')}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void setThumbnailFromImage(e.target.files?.[0])}
                />
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className="mx-auto max-h-[180px] rounded-[var(--radius-card)] object-contain"
                  />
                ) : (
                  <div className="text-text-muted text-[13px]">
                    {extracting
                      ? 'Vorschaubild wird erzeugt …'
                      : 'Noch kein Vorschaubild'}
                  </div>
                )}
                <div className="text-text-muted mt-2 text-[11px]">
                  Eigenen Screenshot wählen, hierher ziehen oder{' '}
                  <strong>Strg+V</strong> einfügen, um die Vorschau zu überschreiben
                </div>
              </label>
              {extractError && (
                <p className="text-danger mt-1.5 text-[11px] leading-relaxed">
                  {extractError}
                </p>
              )}
            </div>
          </>
        )}

        <div>
          <label className={labelClass} htmlFor="cf-title">
            Titel / Diagnose
          </label>
          <input
            id="cf-title"
            ref={titleRef}
            className={inputClassError(!!errors.title)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Lobäre Hirnblutung, MRT T2"
          />
          <FieldHint message={errors.title} />
        </div>

        {ordered.map((group) => {
          const selected = groupValues[group.id] ?? []
          const available = group.values.filter((v) => !selected.includes(v))
          const groupError = errors[`group:${group.id}`]
          return (
            <div key={group.id}>
              <label className={labelClass}>
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: group.colorHex }}
                />
                {group.name}
                {group.required && <span className="text-danger ml-1">*</span>}
              </label>
              <select
                className={inputClassError(!!groupError)}
                value=""
                onChange={(e) => addGroupValue(group.id, e.target.value)}
              >
                <option value="">– hinzufügen –</option>
                {available.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <FieldHint message={groupError} />
              {selected.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => removeGroupValue(group.id, v)}
                      className="bg-tag-bg rounded-[3px] border px-2 py-0.5 text-[11px]"
                      style={{ borderColor: `${group.colorHex}66`, color: group.colorHex }}
                    >
                      {v} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div>
          <label className={labelClass} htmlFor="cf-desc">
            Beschreibung / Lernhinweis
          </label>
          <textarea
            id="cf-desc"
            className={`${inputClass} min-h-[70px] resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Typische Befundmerkmale, Fallstricke, DD …"
          />
        </div>

        <div>
          <label
            className="mb-1.5 block text-xs font-semibold tracking-[0.06em] text-[color:var(--color-note)] uppercase"
            htmlFor="cf-notes"
          >
            📝 Persönliche Notizen
          </label>
          <textarea
            id="cf-notes"
            className="bg-note-bg border-note-border text-note focus:border-note min-h-[90px] w-full resize-y rounded-[var(--radius-card)] border px-2.5 py-2 text-[13px] outline-none transition-colors"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Eigene Gedanken, Erinnerungshaken, persönliche Merkhilfen …"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="cf-tag">
            Eigene Stichworte
          </label>
          <div className="flex gap-2">
            <input
              id="cf-tag"
              className={inputClass}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
              placeholder="Stichwort eingeben + Enter"
            />
            <ModalButton onClick={addTag}>+</ModalButton>
          </div>
          {freeTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {freeTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFreeTags((prev) => prev.filter((x) => x !== t))}
                  className="bg-tag-bg border-border text-text hover:border-danger hover:text-danger rounded-[3px] border px-2 py-0.5 text-[11px]"
                >
                  {t} ×
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
