import { useRef, useState } from 'react'
import type { Settings, TagGroup } from '@/lib/types'
import type { Snapshot } from '@/lib/persistence/format'
import {
  addGroup,
  addValue,
  moveGroup,
  renameGroup,
  renameValue,
  setGroupColor,
  setGroupRequired,
} from '@/lib/tagGroupOps'
import { confirmDeleteGroup, confirmDeleteValue } from '@/lib/tagGroupActions'
import { downloadSnapshot, readSnapshotFromFile } from '@/lib/persistence/json'
import { splitFilename } from '@/lib/image'
import { Modal, ModalButton } from './Modal'
import { EditableText } from './EditableText'

type Mutate = (fn: (s: Snapshot) => Snapshot) => void

const sectionHeadingClass =
  'text-text text-xs font-semibold uppercase tracking-[0.08em]'

/**
 * Einstellungs-Ansicht „Tag-Gruppen verwalten". Zweistufig: Gruppen (Name,
 * Farbe, Pflicht, Reihenfolge) und je Gruppe deren Werte. Reihenfolge der
 * Gruppen entspricht der Sidebar-Anordnung. Alle Änderungen laufen über reine
 * Snapshot-Transforms (tagGroupOps) via applyMutation.
 */
export function SettingsModal({
  snapshot,
  tagGroups,
  settings,
  updateSettings,
  applyMutation,
  onClose,
}: {
  snapshot: Snapshot
  tagGroups: TagGroup[]
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  applyMutation: Mutate
  onClose: () => void
}) {
  const ordered = [...tagGroups].sort((a, b) => a.order - b.order)

  return (
    <Modal
      title="Einstellungen"
      onClose={onClose}
      maxWidth={640}
      footer={<ModalButton onClick={onClose}>Schließen</ModalButton>}
    >
      <div className="flex flex-col gap-3 p-5">
        <h3 className={sectionHeadingClass}>Tag-Gruppen</h3>
        <p className="text-text-muted text-xs leading-relaxed">
          Gruppen strukturieren deine Fälle (z. B. „Modalität" → CT, MRT). Die
          Reihenfolge bestimmt die Anordnung in der Seitenleiste. Werte oder
          Gruppen zu löschen entfernt die jeweilige Zuordnung aus allen Fällen.
        </p>

        {ordered.map((group, i) => (
          <GroupEditor
            key={group.id}
            group={group}
            isFirst={i === 0}
            isLast={i === ordered.length - 1}
            mutate={applyMutation}
          />
        ))}

        <button
          type="button"
          onClick={() => applyMutation((s) => addGroup(s, 'Neue Gruppe'))}
          className="border-border text-text-muted hover:border-accent hover:text-text rounded-[var(--radius-card)] border border-dashed px-3 py-2 text-[13px] transition-colors"
        >
          + Gruppe hinzufügen
        </button>

        <hr className="border-border my-2" />

        <AppearanceSettings settings={settings} updateSettings={updateSettings} />

        <hr className="border-border my-2" />

        <FilenameImportSettings settings={settings} updateSettings={updateSettings} />

        <hr className="border-border my-2" />

        <ViewerSettings settings={settings} updateSettings={updateSettings} />

        <hr className="border-border my-2" />

        <DataBackupSettings snapshot={snapshot} applyMutation={applyMutation} />
      </div>
    </Modal>
  )
}

/**
 * Daten & Backup (Weg A): Export des gesamten Snapshots (inkl. Bilder) als
 * JSON-Datei und Import einer solchen Datei. Die Daten liegen sonst nur im
 * Browser-Speicher (IndexedDB) und sind durch „Browserdaten löschen" gefährdet
 * — der Export ist die vom Nutzer kontrollierte, sicherbare Datei. Import
 * ersetzt den aktuellen Stand (Restore-Semantik) nach Rückfrage.
 */
function DataBackupSettings({
  snapshot,
  applyMutation,
}: {
  snapshot: Snapshot
  applyMutation: Mutate
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const caseCount = snapshot.cases.length

  async function handleImportFile(file: File | undefined) {
    if (!file) return
    let imported: Snapshot
    try {
      imported = await readSnapshotFromFile(file)
    } catch (e) {
      window.alert(
        'Datei konnte nicht gelesen werden: ' +
          (e instanceof Error ? e.message : String(e)),
      )
      return
    }
    const incoming = imported.cases.length
    const ok = window.confirm(
      `Backup importieren?\n\nDas ersetzt die aktuellen Daten (${caseCount} ` +
        `${caseCount === 1 ? 'Fall' : 'Fälle'}) durch die Datei (${incoming} ` +
        `${incoming === 1 ? 'Fall' : 'Fälle'}). Exportiere vorher ein Backup, ` +
        `falls du den aktuellen Stand behalten willst.`,
    )
    if (!ok) return
    applyMutation(() => imported)
    window.alert('Backup importiert.')
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className={sectionHeadingClass}>Daten &amp; Backup</h3>
      <p className="text-text-muted text-xs leading-relaxed">
        Deine Fälle liegen im Browser-Speicher und können durch „Browserdaten
        löschen" verloren gehen. Exportiere regelmäßig eine Backup-Datei (enthält
        alle Bilddaten), die du selbst sicherst oder auf einen USB-Stick kopierst.
        Stelle sicher, dass keine Patientendaten enthalten sind.
      </p>

      <div className="flex flex-wrap gap-2">
        <ModalButton
          variant="primary"
          onClick={() => downloadSnapshot(snapshot)}
        >
          Backup exportieren ({caseCount} {caseCount === 1 ? 'Fall' : 'Fälle'})
        </ModalButton>
        <ModalButton onClick={() => fileRef.current?.click()}>
          Backup importieren …
        </ModalButton>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void handleImportFile(e.target.files?.[0])
            // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
            e.target.value = ''
          }}
        />
      </div>
      <p className="text-text-muted text-[11px] leading-relaxed opacity-80">
        Import ersetzt den aktuellen Stand (Restore aus Backup).
      </p>
    </div>
  )
}

/**
 * Darstellung: Farbschema (Hell/Dunkel). Derselbe Schalter wie der
 * Schnellumschalter unten in der Sidebar — beide schreiben theme via
 * updateSettings, hier nur als beschrifteter Zugang in den Einstellungen.
 */
function AppearanceSettings({
  settings,
  updateSettings,
}: {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className={sectionHeadingClass}>Darstellung</h3>
      <div className="flex items-center gap-3">
        <span className="text-text text-[13px]">Farbschema</span>
        <div className="flex">
          <ThemeSegButton
            active={settings.theme === 'dark'}
            onClick={() => updateSettings({ theme: 'dark' })}
            rounded="left"
          >
            Dunkel
          </ThemeSegButton>
          <ThemeSegButton
            active={settings.theme === 'light'}
            onClick={() => updateSettings({ theme: 'light' })}
            rounded="right"
          >
            Hell
          </ThemeSegButton>
        </div>
      </div>
    </div>
  )
}

function ThemeSegButton({
  active,
  onClick,
  rounded,
  children,
}: {
  active: boolean
  onClick: () => void
  rounded: 'left' | 'right'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'border-border border px-3 py-1 text-[13px] transition-colors',
        rounded === 'left'
          ? 'rounded-l-[var(--radius-card)]'
          : 'rounded-r-[var(--radius-card)] border-l-0',
        active
          ? 'bg-accent border-accent text-white'
          : 'bg-surface-2 text-text-muted hover:text-text',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** Einstellungen zur Vollbild-Ansicht (Lightbox). */
function ViewerSettings({
  settings,
  updateSettings,
}: {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className={sectionHeadingClass}>Vollbild-Ansicht</h3>
      <p className="text-text-muted text-xs leading-relaxed">
        Bestimmt, ob das Notizfeld unter dem Bild beim Öffnen eines Falls
        standardmäßig auf- oder zugeklappt ist. In der Ansicht selbst lässt es
        sich jederzeit per Klick auf die Kopfzeile umschalten.
      </p>
      <label className="text-text flex cursor-pointer items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={settings.notesExpandedByDefault}
          onChange={(e) => updateSettings({ notesExpandedByDefault: e.target.checked })}
        />
        Notizfeld standardmäßig aufgeklappt
      </label>
    </div>
  )
}

/**
 * Einstellungen zum Aufteilen langer Dateinamen beim Import. Schalter +
 * frei wählbares Trennzeichen, plus Live-Vorschau, die sofort zeigt, wie ein
 * Beispiel-Dateiname mit den aktuellen Einstellungen in Titel + Notizen
 * zerlegt würde. Nutzt dieselbe splitFilename()-Funktion wie der Import.
 */
function FilenameImportSettings({
  settings,
  updateSettings,
}: {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}) {
  const [example, setExample] = useState(
    'Mediainfarkt - DWI positiv - FLAIR negativ - <4,5h.png',
  )

  const enabled = settings.filenameSplitEnabled
  const separator = settings.filenameSeparator
  const preview = splitFilename(example, { enabled, separator })
  const noteLines = preview.notes ? preview.notes.split('\n') : []

  return (
    <div className="flex flex-col gap-3">
      <h3 className={sectionHeadingClass}>Dateiname-Import</h3>
      <p className="text-text-muted text-xs leading-relaxed">
        Lange Dateinamen beim Import in Titel + Notizen aufteilen, statt den
        ganzen Namen als Titel zu übernehmen. Gilt für Batch-Import und
        einzelnes Hinzufügen (Upload und Strg+V).
      </p>

      <label className="text-text flex cursor-pointer items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => updateSettings({ filenameSplitEnabled: e.target.checked })}
        />
        Dateiname aufteilen
      </label>

      <div className="flex items-center gap-2">
        <label
          htmlFor="fn-sep"
          className={[
            'text-text-muted text-[13px] transition-opacity',
            enabled ? '' : 'opacity-40',
          ].join(' ')}
        >
          Trennzeichen
        </label>
        <input
          id="fn-sep"
          value={separator}
          disabled={!enabled}
          onChange={(e) => updateSettings({ filenameSeparator: e.target.value })}
          className="bg-bg border-border text-text focus:border-accent w-16 rounded-[var(--radius-card)] border px-2 py-1 text-center text-[13px] outline-none transition-colors disabled:opacity-40"
        />
      </div>

      <div className="border-border bg-surface-2 rounded-[var(--radius-card)] border p-3">
        <label
          htmlFor="fn-example"
          className="text-text-muted mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em]"
        >
          Live-Vorschau
        </label>
        <input
          id="fn-example"
          value={example}
          onChange={(e) => setExample(e.target.value)}
          placeholder="Beispiel-Dateiname eingeben …"
          className="bg-bg border-border text-text focus:border-accent w-full rounded-[var(--radius-card)] border px-2.5 py-2 text-[13px] outline-none transition-colors"
        />

        <div className="mt-3 flex flex-col gap-2 text-[13px]">
          <div>
            <span className="text-text-muted text-xs uppercase tracking-[0.06em]">
              Titel
            </span>
            <div className="text-text mt-0.5 break-words">
              {preview.title || (
                <span className="text-text-muted italic opacity-60">(leer)</span>
              )}
            </div>
          </div>
          <div>
            <span className="text-xs uppercase tracking-[0.06em] text-[color:var(--color-note)]">
              Notizen
            </span>
            {noteLines.length > 0 ? (
              <div className="text-note mt-0.5 flex flex-col gap-0.5">
                {noteLines.map((line, i) => (
                  <span key={i} className="break-words">
                    {line || ' '}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-text-muted mt-0.5 italic opacity-60">(leer)</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function GroupEditor({
  group,
  isFirst,
  isLast,
  mutate,
}: {
  group: TagGroup
  isFirst: boolean
  isLast: boolean
  mutate: Mutate
}) {
  const [newValue, setNewValue] = useState('')

  function commitNewValue() {
    const v = newValue.trim()
    if (v) mutate((s) => addValue(s, group.id, v))
    setNewValue('')
  }

  return (
    <div className="border-border bg-surface-2 rounded-[var(--radius-card)] border p-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <ReorderButton
            label="nach oben"
            disabled={isFirst}
            onClick={() => mutate((s) => moveGroup(s, group.id, -1))}
          >
            ▲
          </ReorderButton>
          <ReorderButton
            label="nach unten"
            disabled={isLast}
            onClick={() => mutate((s) => moveGroup(s, group.id, 1))}
          >
            ▼
          </ReorderButton>
        </div>

        <input
          type="color"
          value={group.colorHex}
          onChange={(e) => mutate((s) => setGroupColor(s, group.id, e.target.value))}
          aria-label="Gruppenfarbe"
          className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
        />

        <EditableText
          value={group.name}
          onCommit={(v) => mutate((s) => renameGroup(s, group.id, v))}
          className="bg-bg border-border text-text focus:border-accent flex-1 rounded-[var(--radius-card)] border px-2 py-1.5 text-[13px] font-semibold outline-none"
          placeholder="Gruppenname"
        />

        <label className="text-text-muted flex shrink-0 items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={group.required}
            onChange={(e) => mutate((s) => setGroupRequired(s, group.id, e.target.checked))}
          />
          Pflicht
        </label>

        <button
          type="button"
          onClick={() => confirmDeleteGroup(mutate, group.id, group.name)}
          aria-label="Gruppe löschen"
          className="text-text-muted hover:text-danger shrink-0 px-1.5 text-lg leading-none"
        >
          🗑
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-9">
        {group.values.length === 0 && (
          <span className="text-text-muted text-xs italic opacity-60">
            noch keine Werte
          </span>
        )}
        {group.values.map((value) => (
          <span
            key={value}
            className="bg-bg flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5"
            style={{ borderColor: `${group.colorHex}66` }}
          >
            <EditableText
              value={value}
              onCommit={(v) => mutate((s) => renameValue(s, group.id, value, v))}
              autoSize
              className="bg-transparent text-[11px] outline-none"
              style={{ color: group.colorHex }}
            />
            <button
              type="button"
              onClick={() => confirmDeleteValue(mutate, group.id, value)}
              aria-label={`Wert „${value}" löschen`}
              className="text-text-muted hover:text-danger text-[11px] leading-none"
            >
              ×
            </button>
          </span>
        ))}

        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitNewValue()
            }
          }}
          onBlur={commitNewValue}
          placeholder="+ Wert"
          className="bg-bg border-border text-text focus:border-accent w-[80px] rounded-[3px] border px-1.5 py-0.5 text-[11px] outline-none"
        />
      </div>
    </div>
  )
}

function ReorderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="text-text-muted hover:text-text text-[9px] leading-tight disabled:cursor-default disabled:opacity-30"
    >
      {children}
    </button>
  )
}
