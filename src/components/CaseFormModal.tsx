import { useEffect, useRef, useState } from 'react'
import type { Case, Settings, TagGroup } from '@/lib/types'
import { cleanFilename, fileToDataUrl, splitFilename } from '@/lib/image'
import { Modal, ModalButton } from './Modal'

/** Eingabedaten eines neuen Falls (ohne id/Zeitstempel — die setzt der Aufrufer). */
export type NewCaseInput = Pick<
  Case,
  'title' | 'description' | 'notes' | 'image' | 'groupValues' | 'freeTags' | 'fileModified'
>

const inputClass =
  'bg-bg border-border text-text focus:border-accent w-full rounded-[var(--radius-card)] border px-2.5 py-2 text-[13px] outline-none transition-colors'
const labelClass =
  'text-text-muted mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em]'

/**
 * Anlege-Formular für Fall (mode='case', mit Bild) oder reine Notiz
 * (mode='note', ohne Bild). Tag-Gruppen werden dynamisch aus tagGroups
 * gerendert; pro Gruppe sind mehrere Werte wählbar.
 */
export function CaseFormModal({
  mode,
  tagGroups,
  settings,
  initial,
  onSubmit,
  onClose,
}: {
  mode: 'case' | 'note'
  tagGroups: TagGroup[]
  settings: Settings
  /** Vorhandener Fall zum Bearbeiten; gesetzt → Edit-Modus (Felder vorbefüllt). */
  initial?: Case
  onSubmit: (data: NewCaseInput) => void
  onClose: () => void
}) {
  const isNote = mode === 'note'
  const isEditing = initial != null
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [image, setImage] = useState<string | null>(initial?.image ?? null)
  const [filename, setFilename] = useState('')
  const [fileModified, setFileModified] = useState<number | undefined>(
    initial?.fileModified,
  )
  const [groupValues, setGroupValues] = useState<Record<string, string[]>>(
    () => ({ ...(initial?.groupValues ?? {}) }),
  )
  const [freeTags, setFreeTags] = useState<string[]>(() => [
    ...(initial?.freeTags ?? []),
  ])
  const [tagInput, setTagInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
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

  // Clipboard-Paste: Screenshot direkt einfügen (nur im Fall-Modus mit Bild).
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
            void handleFile(new File([blob], blob.name || 'Screenshot', { type: blob.type }))
            e.preventDefault()
          }
          break
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNote])

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

  function submit() {
    if (!title.trim()) {
      titleRef.current?.focus()
      return
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
    })
    onClose()
  }

  const ordered = [...tagGroups].sort((a, b) => a.order - b.order)

  return (
    <Modal
      title={
        isEditing
          ? isNote
            ? 'Notiz bearbeiten'
            : 'Fall bearbeiten'
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
        {!isNote && (
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

        <div>
          <label className={labelClass} htmlFor="cf-title">
            Titel / Diagnose
          </label>
          <input
            id="cf-title"
            ref={titleRef}
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Lobäre Hirnblutung, MRT T2"
          />
        </div>

        {ordered.map((group) => {
          const selected = groupValues[group.id] ?? []
          const available = group.values.filter((v) => !selected.includes(v))
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
                className={inputClass}
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
