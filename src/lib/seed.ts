/**
 * Erststart-Daten. Die zwei Default-Tag-Gruppen ersetzen die früher
 * hartkodierten Felder „Modalität" (blau) und „Region" (grün) — sie sind ab
 * jetzt ganz normale, editierbare Gruppen.
 */
import type { Case, TagGroup } from '@/lib/types'
import { createEmptySnapshot, type Snapshot } from '@/lib/persistence/format'

/** Stabile IDs für die Default-Gruppen, damit Demo-Fälle darauf verweisen können. */
export const MODALITY_GROUP_ID = 'group-modality'
export const REGION_GROUP_ID = 'group-region'

/**
 * Stabile IDs der mitgelieferten Demo-Fälle. Bewusst fest (nicht `uid()`), damit
 * sich der unveränderte Erststart-Seed vom echten Bestand des Nutzers
 * unterscheiden lässt (siehe `hasOwnData`) — z. B. für den Start-Dialog, der
 * einen frischen Browser (nur Demo) freundlich begrüßt statt vor Datenverlust zu
 * warnen.
 */
export const DEMO_CASE_IDS = ['demo-mediainfarkt', 'demo-icb', 'demo-ms'] as const
const DEMO_ID_SET = new Set<string>(DEMO_CASE_IDS)

/**
 * Hat der Nutzer eigene Daten (über den reinen Demo-Seed hinaus)? True, sobald
 * mindestens ein Fall existiert, der KEIN mitgelieferter Demo-Fall ist. Ein
 * frischer Browser (nur Demo-Fälle) oder ein leerer Bestand → false.
 */
export function hasOwnData(cases: { id: string }[]): boolean {
  return cases.some((c) => !DEMO_ID_SET.has(c.id))
}

export function defaultTagGroups(): TagGroup[] {
  return [
    {
      id: MODALITY_GROUP_ID,
      name: 'Modalität',
      colorHex: '#2a7db8',
      required: false,
      order: 0,
      values: [
        'CT',
        'MRT',
        'MRT mit KM',
        'MR-Angio',
        'DSA',
        'Röntgen',
        'Sonografie',
        'PET-CT',
      ],
    },
    {
      id: REGION_GROUP_ID,
      name: 'Region',
      colorHex: '#2ea043',
      required: false,
      order: 1,
      values: [
        'Cerebrum',
        'Cerebellum',
        'Hirnstamm',
        'Basalganglien',
        'Ventrikel',
        'Meningen',
        'Sella / Hypophyse',
        'Orbita',
        'HWS',
        'BWS',
        'LWS',
        'Spinalkanal',
        'Karotis / Vertebralis',
      ],
    },
  ]
}

function demoCases(): Case[] {
  const now = Date.now()
  return [
    {
      id: DEMO_CASE_IDS[0],
      title: 'Akuter Mediainfarkt li.',
      description:
        'DWI-Restriktion im Mediastromgebiet links. PWI-DWI-Mismatch beachten. Klassisches FLAIR-neg. Frühzeichen.',
      notes:
        'Merkhilfe: FLAIR negativ + DWI positiv = <4,5h Fenster. Immer PWI anschauen!',
      image: null,
      groupValues: {
        [MODALITY_GROUP_ID]: ['MRT'],
        [REGION_GROUP_ID]: ['Cerebrum'],
      },
      freeTags: ['Ischämie', 'Diffusion', 'DWI'],
      created: now - 8e6,
      updated: now - 8e6,
    },
    {
      id: DEMO_CASE_IDS[1],
      title: 'Lobäre ICB re. frontal',
      description:
        'Hyperdenses Areal frontoparietal rechts. Raumforderungseffekt, kein Ödemrand. DD: Kontusion, CAA.',
      notes: '',
      image: null,
      groupValues: {
        [MODALITY_GROUP_ID]: ['CT'],
        [REGION_GROUP_ID]: ['Cerebrum'],
      },
      freeTags: ['Blutung', 'Trauma', 'CAA'],
      created: now - 4e6,
      updated: now - 4e6,
    },
    {
      id: DEMO_CASE_IDS[2],
      title: 'MS-Plaques periventrikulär',
      description:
        'T2/FLAIR-Hyperintensitäten perpendikulär zur Ventrikelachse (Dawson-Finger). KM-Enhancement in 2 Herden.',
      notes:
        'McDonald 2017: ≥1 Läsion in ≥2 Regionen. Immer juxtakortikal + infratentoriell prüfen.',
      image: null,
      groupValues: {
        [MODALITY_GROUP_ID]: ['MRT'],
        [REGION_GROUP_ID]: ['Cerebrum'],
      },
      freeTags: ['Demyelinisierung', 'MS', 'Dawson'],
      created: now - 2e6,
      updated: now - 2e6,
    },
  ]
}

/** Vollständiger Erststart-Snapshot: Default-Gruppen + Demo-Fälle. */
export function createSeedSnapshot(): Snapshot {
  return {
    ...createEmptySnapshot(),
    tagGroups: defaultTagGroups(),
    cases: demoCases(),
  }
}
