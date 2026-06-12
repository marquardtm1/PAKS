/**
 * Reine Snapshot-Transformationen für das konfigurierbare Tag-Gruppen-System.
 * Zweistufig und flach: Gruppe → Werte, keine Verschachtelung.
 *
 * Alle Operationen sind (Snapshot, …) → Snapshot und werden vom Store über
 * applyMutation angewandt. Operationen, die Gruppen/Werte entfernen oder
 * umbenennen, kaskadieren konsistent in die groupValues bestehender Fälle —
 * sonst blieben verwaiste Zuordnungen zurück.
 */
import { uid } from '@/lib/id'
import type { Case, TagGroup } from '@/lib/types'
import type { Snapshot } from '@/lib/persistence/format'

/** Farbpalette für neue Gruppen (wird der Reihe nach vergeben). */
const GROUP_COLOR_PALETTE = [
  '#2a7db8',
  '#2ea043',
  '#b8960a',
  '#9a5cb4',
  '#cf4f47',
  '#3aa8a0',
  '#c87f3a',
  '#5c87d6',
]

/** Sortiert Gruppen nach order und vergibt order = 0..n-1 neu (lückenlos). */
function normalize(groups: TagGroup[]): TagGroup[] {
  return [...groups]
    .sort((a, b) => a.order - b.order)
    .map((g, i) => (g.order === i ? g : { ...g, order: i }))
}

function nextColor(groups: TagGroup[]): string {
  const used = new Set(groups.map((g) => g.colorHex.toLowerCase()))
  const free = GROUP_COLOR_PALETTE.find((c) => !used.has(c.toLowerCase()))
  return free ?? GROUP_COLOR_PALETTE[groups.length % GROUP_COLOR_PALETTE.length]
}

export function addGroup(s: Snapshot, name: string): Snapshot {
  const group: TagGroup = {
    id: `group-${uid()}`,
    name: name.trim() || 'Neue Gruppe',
    colorHex: nextColor(s.tagGroups),
    required: false,
    values: [],
    order: s.tagGroups.length,
  }
  return { ...s, tagGroups: normalize([...s.tagGroups, group]) }
}

function patchGroup(
  s: Snapshot,
  id: string,
  patch: Partial<TagGroup>,
): Snapshot {
  return {
    ...s,
    tagGroups: s.tagGroups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
  }
}

export function renameGroup(s: Snapshot, id: string, name: string): Snapshot {
  const trimmed = name.trim()
  if (!trimmed) return s
  return patchGroup(s, id, { name: trimmed })
}

export function setGroupColor(s: Snapshot, id: string, colorHex: string): Snapshot {
  return patchGroup(s, id, { colorHex })
}

export function setGroupRequired(s: Snapshot, id: string, required: boolean): Snapshot {
  return patchGroup(s, id, { required })
}

/** Gruppe löschen und ihre Zuordnung aus allen Fällen entfernen. */
export function deleteGroup(s: Snapshot, id: string): Snapshot {
  const cases: Case[] = s.cases.map((c) => {
    if (!(id in c.groupValues)) return c
    const next = { ...c.groupValues }
    delete next[id]
    return { ...c, groupValues: next }
  })
  return { ...s, tagGroups: normalize(s.tagGroups.filter((g) => g.id !== id)), cases }
}

/** Gruppe in der Priorität (Sidebar-Reihenfolge) um eine Position verschieben. */
export function moveGroup(s: Snapshot, id: string, dir: -1 | 1): Snapshot {
  const ordered = normalize(s.tagGroups)
  const idx = ordered.findIndex((g) => g.id === id)
  const target = idx + dir
  if (idx < 0 || target < 0 || target >= ordered.length) return s
  const swapped = [...ordered]
  ;[swapped[idx], swapped[target]] = [swapped[target], swapped[idx]]
  return { ...s, tagGroups: swapped.map((g, i) => ({ ...g, order: i })) }
}

export function addValue(s: Snapshot, groupId: string, value: string): Snapshot {
  const v = value.trim()
  if (!v) return s
  return {
    ...s,
    tagGroups: s.tagGroups.map((g) =>
      g.id === groupId && !g.values.includes(v)
        ? { ...g, values: [...g.values, v] }
        : g,
    ),
  }
}

/** Wert umbenennen — in der Gruppenliste UND in allen Fällen, die ihn tragen. */
export function renameValue(
  s: Snapshot,
  groupId: string,
  oldValue: string,
  newValue: string,
): Snapshot {
  const v = newValue.trim()
  if (!v || v === oldValue) return s
  const tagGroups = s.tagGroups.map((g) => {
    if (g.id !== groupId) return g
    // Bei Kollision mit bestehendem Wert nur den alten entfernen (dedupe).
    const values = g.values.filter((x) => x !== oldValue)
    if (!values.includes(v)) values.push(v)
    return { ...g, values }
  })
  const cases = s.cases.map((c) => {
    const current = c.groupValues[groupId]
    if (!current || !current.includes(oldValue)) return c
    const replaced = current.map((x) => (x === oldValue ? v : x))
    return {
      ...c,
      groupValues: { ...c.groupValues, [groupId]: [...new Set(replaced)] },
    }
  })
  return { ...s, tagGroups, cases }
}

/**
 * Einem oder mehreren Fällen einen Gruppen-Wert zuordnen (Tagging per Drag &
 * Drop, auch bei Mehrfachauswahl). Eine einzige Transformation → ein Undo-Schritt
 * für alle Zuordnungen. Idempotent pro Fall: bereits gesetzte Werte bleiben
 * unverändert. Ändert sich nichts (alle Fälle hatten den Wert schon, leere Liste
 * oder unbekannter Wert), wird derselbe Snapshot zurückgegeben — so entsteht kein
 * leerer Undo-Eintrag (applyMutation kürzt bei `next === current` ab).
 */
export function assignValueToCases(
  s: Snapshot,
  caseIds: string[],
  groupId: string,
  value: string,
): Snapshot {
  const group = s.tagGroups.find((g) => g.id === groupId)
  if (!group || !group.values.includes(value)) return s
  const targets = new Set(caseIds)
  if (targets.size === 0) return s

  let changed = false
  const cases = s.cases.map((c) => {
    if (!targets.has(c.id)) return c
    const current = c.groupValues[groupId] ?? []
    if (current.includes(value)) return c
    changed = true
    return {
      ...c,
      groupValues: { ...c.groupValues, [groupId]: [...current, value] },
      updated: Date.now(),
    }
  })
  return changed ? { ...s, cases } : s
}

/** Wert löschen — aus der Gruppenliste UND aus allen Fällen. */
export function deleteValue(s: Snapshot, groupId: string, value: string): Snapshot {
  const tagGroups = s.tagGroups.map((g) =>
    g.id === groupId ? { ...g, values: g.values.filter((v) => v !== value) } : g,
  )
  const cases = s.cases.map((c) => {
    const current = c.groupValues[groupId]
    if (!current || !current.includes(value)) return c
    return {
      ...c,
      groupValues: { ...c.groupValues, [groupId]: current.filter((v) => v !== value) },
    }
  })
  return { ...s, tagGroups, cases }
}
