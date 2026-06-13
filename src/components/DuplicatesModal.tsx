import { useEffect, useMemo, useState } from 'react'
import type { Case, TagGroup } from '@/lib/types'
import type { Snapshot } from '@/lib/persistence/format'
import { caseChips } from '@/lib/tags'
import {
  defaultKeepId,
  findDuplicateGroups,
  hasLoss,
  mergeInto,
  metadataLoss,
  type DuplicateGroup,
} from '@/lib/duplicates'
import { Modal, ModalButton } from './Modal'
import { TagChip } from './TagChip'

type Mutate = (fn: (s: Snapshot) => Snapshot, opts?: { label?: string }) => void

/**
 * „Duplikate finden" — Stufe 1 (exakte Bild-Dubletten).
 *
 * Beim Öffnen wird der ganze Bestand auf bitweise identische Bilder geprüft
 * (SHA-256 der Bilddaten). Pro Treffergruppe wählt der Nutzer, welcher Fall
 * behalten wird (Default: am besten gepflegt); die anderen werden gelöscht.
 *
 * Metadaten-Schutz: Tragen zu löschende Duplikate Tags/Notizen, die der
 * Behaltene nicht hat, wird gewarnt und (empfohlen) angeboten, sie vor dem
 * Löschen zu übernehmen. Merge + Löschung laufen als EINE Mutation — ein
 * Undo-Schritt holt beides zurück. Gelöscht wird nie automatisch, erst nach
 * ausdrücklicher Bestätigung mit Anzahl.
 */
export function DuplicatesModal({
  cases,
  tagGroups,
  applyMutation,
  onClose,
}: {
  cases: Case[]
  tagGroups: TagGroup[]
  applyMutation: Mutate
  onClose: () => void
}) {
  const [status, setStatus] = useState<'scanning' | 'done' | 'error'>('scanning')
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  // Behalten-Auswahl je Gruppe (Schlüssel = Gruppen-Hash → Fall-ID).
  const [keepByHash, setKeepByHash] = useState<Record<string, string>>({})
  // Merge-Wahl: globaler Schalter als Default + Übersteuerung je Gruppe. Eine
  // Gruppe ohne eigenen Eintrag folgt dem globalen Default; der globale Schalter
  // leert die Übersteuerungen und zieht damit alle Gruppen wieder auf den Default.
  const [globalMerge, setGlobalMerge] = useState(true)
  const [mergeByHash, setMergeByHash] = useState<Record<string, boolean>>({})
  // Zweiter Schritt: In-App-Bestätigung (statt window.confirm), damit die volle
  // Liste der zu löschenden Fälle scrollbar gezeigt werden kann.
  const [confirming, setConfirming] = useState(false)

  const mergeFor = (hash: string): boolean => mergeByHash[hash] ?? globalMerge

  function setGlobalMergeAll(v: boolean) {
    setGlobalMerge(v)
    setMergeByHash({}) // alle Gruppen folgen wieder dem (neuen) Default
  }

  useEffect(() => {
    let cancelled = false
    setStatus('scanning')
    findDuplicateGroups(cases)
      .then((result) => {
        if (cancelled) return
        setGroups(result)
        setKeepByHash(
          Object.fromEntries(result.map((g) => [g.hash, defaultKeepId(g)])),
        )
        setStatus('done')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [cases])

  // Pro Gruppe: Behaltener Fall, zu löschende Fälle und drohender Metadaten-Verlust.
  const resolved = useMemo(
    () =>
      groups.map((group) => {
        const keepId = keepByHash[group.hash] ?? group.cases[0].id
        const keep = group.cases.find((c) => c.id === keepId) ?? group.cases[0]
        const others = group.cases.filter((c) => c.id !== keep.id)
        return { group, keep, others, loss: metadataLoss(keep, others) }
      }),
    [groups, keepByHash],
  )

  const deleteCount = resolved.reduce((n, r) => n + r.others.length, 0)
  // Gruppen, bei denen überhaupt Metadaten verloren gehen könnten (= wo der
  // Merge-Schalter relevant ist), und davon die mit aktivem Merge.
  const lossGroups = resolved.filter((r) => r.others.length > 0 && hasLoss(r.loss))
  const anyLoss = lossGroups.length > 0
  const mergedLossCount = lossGroups.filter((r) => mergeFor(r.group.hash)).length
  // Vollständige Titelliste der zu löschenden Fälle (für die scrollbare Bestätigung).
  const deleteTitles = resolved
    .flatMap((r) => r.others)
    .map((o) => o.title.trim() || '(ohne Titel)')

  function executeDelete() {
    applyMutation(
      (s) => {
        const byId = new Map(s.cases.map((c) => [c.id, c]))
        const toDelete = new Set<string>()
        const replacements = new Map<string, Case>()
        for (const { group, keep, others, loss } of resolved) {
          const keepCase = byId.get(keep.id)
          if (!keepCase) continue
          const otherCases = others
            .map((o) => byId.get(o.id))
            .filter((c): c is Case => !!c)
          otherCases.forEach((o) => toDelete.add(o.id))
          // Pro Gruppe gemäß ihrem eigenen Schalter mergen; nur wenn sonst etwas
          // verloren ginge (kein unnötiger updated-Bump am Behaltenen).
          if (mergeFor(group.hash) && otherCases.length > 0 && hasLoss(loss)) {
            replacements.set(keep.id, mergeInto(keepCase, otherCases))
          }
        }
        return {
          ...s,
          cases: s.cases
            .filter((c) => !toDelete.has(c.id))
            .map((c) => replacements.get(c.id) ?? c),
        }
      },
      { label: `Duplikate entfernt (${deleteCount})` },
    )
    onClose()
  }

  const showActions = status === 'done' && groups.length > 0

  return (
    <Modal
      title={confirming ? 'Löschen bestätigen' : 'Duplikate finden'}
      onClose={onClose}
      maxWidth={880}
      footer={
        confirming ? (
          <div className="flex w-full items-center justify-end gap-2">
            <ModalButton onClick={() => setConfirming(false)}>Zurück</ModalButton>
            <ModalButton variant="primary" onClick={executeDelete}>
              Endgültig löschen ({deleteCount})
            </ModalButton>
          </div>
        ) : showActions ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <label className="text-text flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={globalMerge}
                onChange={(e) => setGlobalMergeAll(e.target.checked)}
              />
              Tags &amp; Notizen übernehmen — Standard für alle Gruppen
              {anyLoss && <span className="text-accent"> (empfohlen)</span>}
            </label>
            <div className="flex gap-2">
              <ModalButton onClick={onClose}>Abbrechen</ModalButton>
              <ModalButton variant="primary" onClick={() => setConfirming(true)}>
                Markierte löschen ({deleteCount})
              </ModalButton>
            </div>
          </div>
        ) : (
          <ModalButton onClick={onClose}>Schließen</ModalButton>
        )
      }
    >
      {confirming ? (
        <DeleteConfirmView
          titles={deleteTitles}
          mergedLossCount={mergedLossCount}
          lossGroupCount={lossGroups.length}
        />
      ) : (
        <div className="flex flex-col gap-4 p-5">
        <p className="text-text-muted text-xs leading-relaxed">
          Prüft den gesamten Bestand auf <strong>bitweise identische Bilder</strong>{' '}
          (Hash der Bilddaten). Pro Gruppe wählst du den Fall, der{' '}
          <strong>behalten</strong> wird — die übrigen werden nach Bestätigung
          gelöscht. Nie automatisch.
        </p>

        {status === 'scanning' && (
          <div className="text-text-muted py-10 text-center text-sm">
            Prüfe {cases.filter((c) => c.image).length} Bilder …
          </div>
        )}

        {status === 'error' && (
          <div className="text-danger py-10 text-center text-sm">
            Die Prüfung ist fehlgeschlagen (Hash-Funktion nicht verfügbar).
          </div>
        )}

        {status === 'done' && groups.length === 0 && (
          <div className="text-text py-10 text-center">
            <div className="mb-2 text-4xl opacity-40">✅</div>
            <div className="text-sm">Keine Duplikate gefunden.</div>
          </div>
        )}

        {showActions && (
          <>
            <div className="text-text text-[13px]">
              {groups.length} {groups.length === 1 ? 'Gruppe' : 'Gruppen'} ·{' '}
              {deleteCount} {deleteCount === 1 ? 'Fall' : 'Fälle'} zum Löschen
              markiert
            </div>
            <div className="flex flex-col gap-5">
              {resolved.map(({ group, keep, others, loss }, i) => (
                <DuplicateGroupView
                  key={group.hash}
                  index={i + 1}
                  group={group}
                  keepId={keep.id}
                  loss={loss}
                  merge={mergeFor(group.hash)}
                  hasOthers={others.length > 0}
                  tagGroups={tagGroups}
                  onKeep={(id) =>
                    setKeepByHash((prev) => ({ ...prev, [group.hash]: id }))
                  }
                  onToggleMerge={(v) =>
                    setMergeByHash((prev) => ({ ...prev, [group.hash]: v }))
                  }
                />
              ))}
            </div>
          </>
        )}
        </div>
      )}
    </Modal>
  )
}

/**
 * Bestätigungs-Schritt: zeigt vollständig (scrollbar) die Titel der zu
 * löschenden Fälle, plus optionalen Merge-Hinweis. Erst der Footer-Button
 * „Endgültig löschen" führt aus.
 */
function DeleteConfirmView({
  titles,
  mergedLossCount,
  lossGroupCount,
}: {
  titles: string[]
  mergedLossCount: number
  lossGroupCount: number
}) {
  return (
    <div className="flex flex-col gap-3 p-5">
      <p className="text-text text-[13px]">
        {titles.length} {titles.length === 1 ? 'Fall wird' : 'Fälle werden'}{' '}
        gelöscht. Folgende Fälle werden entfernt:
      </p>
      <div className="border-border bg-surface-2 max-h-[45vh] overflow-y-auto rounded-[var(--radius-card)] border">
        <ul className="divide-border divide-y">
          {titles.map((t, i) => (
            <li key={i} className="text-text truncate px-3 py-1.5 text-[13px]" title={t}>
              {t}
            </li>
          ))}
        </ul>
      </div>
      {lossGroupCount > 0 && (
        <p className="text-text-muted text-xs leading-relaxed">
          {mergedLossCount === 0
            ? `In keiner von ${lossGroupCount} Gruppe(n) mit zusätzlichen Metadaten ` +
              `werden diese übernommen — sie gehen verloren.`
            : `In ${mergedLossCount} von ${lossGroupCount} Gruppe(n) mit zusätzlichen ` +
              `Metadaten werden Tags & Notizen auf den behaltenen Fall übertragen.`}
        </p>
      )}
      <p className="text-text-muted text-xs">Rückgängig per Strg+Z möglich.</p>
    </div>
  )
}

function DuplicateGroupView({
  index,
  group,
  keepId,
  loss,
  merge,
  hasOthers,
  tagGroups,
  onKeep,
  onToggleMerge,
}: {
  index: number
  group: DuplicateGroup
  keepId: string
  loss: ReturnType<typeof metadataLoss>
  merge: boolean
  hasOthers: boolean
  tagGroups: TagGroup[]
  onKeep: (id: string) => void
  onToggleMerge: (v: boolean) => void
}) {
  const lossActive = hasOthers && hasLoss(loss)

  return (
    <div className="border-border bg-surface-2 rounded-[var(--radius-card)] border p-3">
      <div className="text-text-muted mb-2.5 text-[11px] font-semibold tracking-[0.06em] uppercase">
        Gruppe {index} · {group.cases.length} identische Bilder
      </div>
      <div className="flex flex-wrap gap-3">
        {group.cases.map((c) => (
          <DuplicateCaseCard
            key={c.id}
            c={c}
            kept={c.id === keepId}
            tagGroups={tagGroups}
            onKeep={() => onKeep(c.id)}
          />
        ))}
      </div>

      {lossActive && (
        <div
          className={[
            'mt-3 rounded-[var(--radius-card)] border px-3 py-2 text-[12px] leading-relaxed',
            merge ? 'border-accent/50' : 'border-danger',
          ].join(' ')}
        >
          <label className="text-text flex cursor-pointer items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={merge}
              onChange={(e) => onToggleMerge(e.target.checked)}
            />
            Tags &amp; Notizen dieser Gruppe übernehmen
          </label>
          <div className={merge ? 'text-text mt-1' : 'text-danger mt-1'}>
            {merge ? '↪ Wird übernommen' : '⚠ Geht beim Löschen verloren'}:{' '}
            {loss.tags.length > 0 && (
              <>
                Tags <span className="font-semibold">{loss.tags.join(', ')}</span>
                {loss.notes && ' · '}
              </>
            )}
            {loss.notes && <span className="font-semibold">Notiz</span>}
            {!merge && (
              <span className="text-text-muted">
                {' '}
                — nur beim behaltenen Fall fehlend.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DuplicateCaseCard({
  c,
  kept,
  tagGroups,
  onKeep,
}: {
  c: Case
  kept: boolean
  tagGroups: TagGroup[]
  onKeep: () => void
}) {
  const chips = caseChips(c, tagGroups)
  const note = c.notes.trim()
  const dated = c.fileModified != null
  const dateMs = c.fileModified ?? c.created

  return (
    <div
      className={[
        'flex w-[185px] flex-col overflow-hidden rounded-[var(--radius-card)] border transition-colors',
        kept
          ? 'border-accent ring-accent bg-surface ring-1'
          : 'border-border bg-surface opacity-90',
      ].join(' ')}
    >
      {c.image && (
        <img
          src={c.image}
          alt={c.title}
          className="block aspect-square w-full bg-black object-cover"
        />
      )}
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="truncate text-[13px] font-semibold" title={c.title}>
          {c.title || '(ohne Titel)'}
        </div>

        <div className="text-text-muted text-[10px]">
          {dated ? 'Datei' : 'Hinzugefügt'}: {formatDate(dateMs)}
        </div>

        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {chips.map((chip, i) => (
              <TagChip key={i} chip={chip} />
            ))}
          </div>
        ) : (
          <div className="text-text-muted text-[10px] italic opacity-60">
            keine Tags
          </div>
        )}

        {note && (
          <div
            className="text-note line-clamp-3 text-[11px] leading-snug"
            title={note}
          >
            📝 {note}
          </div>
        )}

        <label
          className={[
            'mt-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-card)] border py-1 text-[12px] transition-colors',
            kept
              ? 'border-accent bg-accent text-white'
              : 'border-border text-text-muted hover:border-accent hover:text-text',
          ].join(' ')}
        >
          <input
            type="radio"
            checked={kept}
            onChange={onKeep}
            className="sr-only"
          />
          {kept ? '✓ Behalten' : 'Behalten'}
        </label>
        {!kept && (
          <div className="text-danger text-center text-[10px]">wird gelöscht</div>
        )}
      </div>
    </div>
  )
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}
