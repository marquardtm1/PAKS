/**
 * Dünne UI-Aktionen über den Tag-Gruppen-Mutationen: Lösch-Bestätigung mit
 * Kaskaden-Hinweis. Zentralisiert, damit Sidebar und Settings-Modal denselben
 * Bestätigungstext und dieselbe Mutation verwenden — keine Duplikation.
 */
import { deleteGroup, deleteValue } from './tagGroupOps'
import type { Snapshot } from './persistence/format'

type Mutate = (fn: (s: Snapshot) => Snapshot) => void

export function confirmDeleteGroup(mutate: Mutate, id: string, name: string): void {
  if (
    window.confirm(
      `Gruppe „${name}" löschen? Die Zuordnung wird aus allen Fällen entfernt.`,
    )
  ) {
    mutate((s) => deleteGroup(s, id))
  }
}

export function confirmDeleteValue(
  mutate: Mutate,
  groupId: string,
  value: string,
): void {
  if (
    window.confirm(
      `Wert „${value}" löschen? Die Zuordnung wird aus allen Fällen entfernt.`,
    )
  ) {
    mutate((s) => deleteValue(s, groupId, value))
  }
}
