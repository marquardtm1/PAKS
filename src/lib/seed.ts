/**
 * Erststart-Daten. Die Default-Tag-Gruppen sind ab jetzt ganz normale,
 * editierbare Gruppen — neue Nutzer starten mit „Region" und „Ätiologie".
 */
import type { Case, TagGroup } from '@/lib/types'
import { createEmptySnapshot, type Snapshot } from '@/lib/persistence/format'

/** Stabile IDs für die Default-Gruppen, damit Seed-Fälle darauf verweisen können. */
export const REGION_GROUP_ID = 'group-region'
export const ETIOLOGY_GROUP_ID = 'group-etiology'

/** Stabile ID der mitgelieferten Willkommens-/Anleitungs-Notiz. */
export const WELCOME_NOTE_ID = 'demo-welcome'

/**
 * Stabile IDs der mitgelieferten Seed-Fälle. Bewusst fest (nicht `uid()`), damit
 * sich der unveränderte Erststart-Seed vom echten Bestand des Nutzers
 * unterscheiden lässt (siehe `hasOwnData`) — z. B. für den Start-Dialog, der
 * einen frischen Browser (nur Seed) freundlich begrüßt statt vor Datenverlust zu
 * warnen.
 *
 * Enthält neben der aktuellen Willkommens-Notiz auch die IDs der FRÜHEREN
 * fachlichen Demo-Fälle — damit Bestandsnutzer, die diese nie gelöscht haben,
 * weiterhin korrekt als „nur Seed" (Fall A) statt als eigener Bestand (Fall B)
 * erkannt werden.
 */
export const DEMO_CASE_IDS = [
  WELCOME_NOTE_ID,
  // Alt-Seed (vor dem Wechsel auf die Anleitungs-Notiz) — nur noch zur Erkennung.
  'demo-mediainfarkt',
  'demo-icb',
  'demo-ms',
] as const
const DEMO_ID_SET = new Set<string>(DEMO_CASE_IDS)

/**
 * Hat der Nutzer eigene Daten (über den reinen Seed hinaus)? True, sobald
 * mindestens ein Fall existiert, der KEIN mitgelieferter Seed-Fall ist. Ein
 * frischer Browser (nur Seed) oder ein leerer Bestand → false.
 */
export function hasOwnData(cases: { id: string }[]): boolean {
  return cases.some((c) => !DEMO_ID_SET.has(c.id))
}

export function defaultTagGroups(): TagGroup[] {
  return [
    {
      id: REGION_GROUP_ID,
      name: 'Region',
      colorHex: '#2ea043',
      required: false,
      order: 0,
      values: ['Gehirn', 'Kopf/Hals', 'Wirbelsäule'],
    },
    {
      id: ETIOLOGY_GROUP_ID,
      name: 'Ätiologie',
      colorHex: '#a371f7',
      required: false,
      order: 1,
      values: [
        'entwicklungsbedingt',
        'exogen',
        'neoplastisch',
        'entzündlich',
        'kardiovaskulär/hämatologisch',
        'strukturell/funktionell',
      ],
    },
  ]
}

/**
 * Eine einzelne Willkommens-/Anleitungs-Notiz als Seed (reine Notiz, kein Bild).
 * Behält eine stabile DEMO_CASE_ID, damit hasOwnData / der Startup-Dialog den
 * frischen Browser weiter als Fall A erkennen. (Ein Demo-Bild mit Beispiel-
 * Annotationen kommt später separat dazu.)
 */
function demoCases(): Case[] {
  const now = Date.now()
  return [
    {
      id: WELCOME_NOTE_ID,
      title: '👋 Willkommen bei PAKS — so funktioniert es',
      description:
        'PAKS ist dein persönliches, lokales Bildarchiv & Lernsystem. Alle Daten bleiben auf deinem Gerät — kein Konto, keine Cloud. So legst du los:',
      notes:
        '1) Bilder importieren – per Drag & Drop, Datei-Auswahl oder Strg+V (Screenshot direkt einfügen).\n' +
        '2) Taggen – Fälle den Kategorien links zuordnen (z. B. Region, Ätiologie). Kategorien sind in den Einstellungen frei erweiterbar.\n' +
        '3) Annotieren – in der Großansicht (Doppelklick) Pfeile, Kreise und Rechtecke einzeichnen, beschriften und ein-/ausblenden.\n' +
        '4) Sichern – oben rechts eine Datendatei verbinden (Chrome/Edge) oder per Backup-Knopf exportieren. Ohne verbundene Datei liegen die Daten nur im Browser und gehen bei „Browserdaten löschen" verloren.\n\n' +
        'Diese Notiz kannst du löschen, sobald du startklar bist (Mülleimer-Symbol auf der Kachel).',
      image: null,
      groupValues: {},
      freeTags: [],
      created: now,
      updated: now,
    },
  ]
}

/** Vollständiger Erststart-Snapshot: Default-Gruppen + Anleitungs-Notiz. */
export function createSeedSnapshot(): Snapshot {
  return {
    ...createEmptySnapshot(),
    tagGroups: defaultTagGroups(),
    cases: demoCases(),
  }
}
