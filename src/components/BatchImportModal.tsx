import { useState } from 'react'
import type { Settings, TagGroup } from '@/lib/types'
import { uid } from '@/lib/id'
import { cleanFilename, fileToDataUrl, splitFilename } from '@/lib/image'
import { Modal, ModalButton } from './Modal'
import { EditableText } from './EditableText'
import type { NewCaseInput } from './CaseFormModal'

interface BatchItem {
  id: string
  title: string
  /** Aus dem Dateinamen abgeleitete Notizen (bei aktivierter Aufteilung). */
  notes: string
  filename: string
  image: string
  /** Echtes Datei-Datum (file.lastModified) für die Datums-Sortierung. */
  fileModified?: number
}

const labelClass =
  'text-text-muted mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em]'
const inputClass =
  'bg-bg border-border text-text focus:border-accent w-full rounded-[var(--radius-card)] border px-2.5 py-2 text-[13px] outline-none transition-colors'

/**
 * Batch-Import des eigenen Bestands: mehrere Bilder auf einmal auswählen
 * (Mehrfach-Upload / Drag&Drop), Dateiname wird Titel (einzeln editierbar),
 * unerwünschte vor dem Import entfernen, optional Tag-Gruppen-Werte für den
 * ganzen Batch vorbelegen. Alle ausgewählten werden gesammelt als Fälle angelegt.
 */
export function BatchImportModal({
  tagGroups,
  settings,
  onImport,
  onClose,
}: {
  tagGroups: TagGroup[]
  settings: Settings
  onImport: (cases: NewCaseInput[]) => void
  onClose: () => void
}) {
  const [items, setItems] = useState<BatchItem[]>([])
  const [groupValues, setGroupValues] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function addFiles(fileList: FileList | null | undefined) {
    if (!fileList) return
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setBusy(true)
    const newItems = await Promise.all(
      files.map(async (f) => {
        const { title, notes } = splitFilename(f.name, {
          enabled: settings.filenameSplitEnabled,
          separator: settings.filenameSeparator,
        })
        return {
          id: uid(),
          title,
          notes,
          filename: cleanFilename(f.name),
          image: await fileToDataUrl(f),
          fileModified: f.lastModified || undefined,
        }
      }),
    )
    setItems((prev) => [...prev, ...newItems])
    setBusy(false)
  }

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

  function doImport() {
    if (!items.length) return
    const cleanedGroups: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(groupValues)) {
      if (v.length) cleanedGroups[k] = v
    }
    const cases: NewCaseInput[] = items.map((it) => ({
      title: it.title.trim() || it.filename,
      description: '',
      notes: it.notes,
      image: it.image,
      groupValues: cleanedGroups,
      freeTags: [],
      fileModified: it.fileModified,
    }))
    onImport(cases)
    onClose()
  }

  const ordered = [...tagGroups].sort((a, b) => a.order - b.order)

  return (
    <Modal
      title="Bestand importieren"
      onClose={onClose}
      maxWidth={760}
      footer={
        <>
          <ModalButton onClick={onClose}>Abbrechen</ModalButton>
          <ModalButton variant="primary" onClick={doImport}>
            {items.length > 0
              ? `${items.length} ${items.length === 1 ? 'Fall' : 'Fälle'} importieren`
              : 'Importieren'}
          </ModalButton>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void addFiles(e.dataTransfer.files)
          }}
          className={[
            'block cursor-pointer rounded-[var(--radius-card)] border-2 border-dashed px-6 py-6 text-center transition-colors',
            dragOver ? 'border-accent bg-surface-2' : 'border-border',
          ].join(' ')}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void addFiles(e.target.files)}
          />
          <div className="mb-1 text-2xl">🗂️</div>
          <div className="text-text-muted text-[13px]">
            Mehrere Bilder hierher ziehen oder klicken zum Auswählen
          </div>
          <div className="text-text-muted mt-1 text-[11px]">
            Dateiname wird Titel · bleibt lokal · keine Patientendaten hochladen
          </div>
        </label>

        {busy && (
          <div className="text-text-muted text-center text-[13px]">Lade Bilder …</div>
        )}

        {ordered.length > 0 && items.length > 0 && (
          <div>
            <span className={labelClass}>Tags für den ganzen Batch (optional)</span>
            <div className="flex flex-col gap-2.5">
              {ordered.map((group) => {
                const selected = groupValues[group.id] ?? []
                const available = group.values.filter((v) => !selected.includes(v))
                return (
                  <div key={group.id} className="flex items-start gap-2">
                    <select
                      className={inputClass}
                      value=""
                      onChange={(e) => addGroupValue(group.id, e.target.value)}
                    >
                      <option value="">
                        {group.name} – hinzufügen …
                      </option>
                      {available.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                    {selected.length > 0 && (
                      <div className="flex flex-1 flex-wrap gap-1.5 pt-1.5">
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
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
          >
            {items.map((it) => (
              <div
                key={it.id}
                className="border-border bg-surface-2 group/item relative overflow-hidden rounded-[var(--radius-card)] border"
              >
                <img
                  src={it.image}
                  alt={it.title}
                  className="block aspect-square w-full bg-black object-cover"
                />
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                  aria-label="Entfernen"
                  title="Aus Import entfernen"
                  className="bg-bg/80 text-text hover:text-danger absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full text-sm leading-none opacity-0 transition-opacity group-hover/item:opacity-100"
                >
                  ×
                </button>
                <div className="p-1.5">
                  <EditableText
                    value={it.title}
                    onCommit={(v) =>
                      setItems((prev) =>
                        prev.map((x) => (x.id === it.id ? { ...x, title: v } : x)),
                      )
                    }
                    className="bg-bg border-border text-text focus:border-accent w-full rounded-[3px] border px-1.5 py-1 text-[12px] outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
