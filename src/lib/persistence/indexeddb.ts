/**
 * Phase-1-Persistenz: ein einzelner Snapshot in IndexedDB.
 *
 * Bewusst simpel — der ganze Snapshot liegt unter einem festen Schlüssel.
 * In Phase 1 ist das die einzige Persistenz; sobald Weg B (lebende Datei)
 * kommt, bleibt IndexedDB als Cache/Arbeitsspeicher bestehen, ist aber nicht
 * mehr die „source of truth". Die Schnittstelle (PersistenceAdapter) ändert
 * sich dadurch nicht.
 */
import type { PersistenceAdapter, PersistenceCapabilities } from './adapter'
import { fromParsed, type Snapshot } from './format'

const DB_NAME = 'paks'
const STORE_NAME = 'snapshot'
const SNAPSHOT_KEY = 'current'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const request = run(transaction.objectStore(STORE_NAME))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export class IndexedDBAdapter implements PersistenceAdapter {
  readonly name = 'indexeddb'
  readonly capabilities: PersistenceCapabilities = {
    livePersist: true,
    pickFile: false,
  }

  async load(): Promise<Snapshot | null> {
    const db = await openDb()
    try {
      const stored = await tx<unknown>(db, 'readonly', (store) =>
        store.get(SNAPSHOT_KEY),
      )
      if (stored == null) return null
      // Validiert/migriert über das gemeinsame Format — kein Sonderweg.
      return fromParsed(stored)
    } finally {
      db.close()
    }
  }

  async save(snapshot: Snapshot): Promise<void> {
    const db = await openDb()
    try {
      // Als reines Objekt ablegen (strukturiert klonbar); Validierung erfolgt
      // beim Laden über fromParsed().
      await tx(db, 'readwrite', (store) =>
        store.put(snapshot, SNAPSHOT_KEY),
      )
    } finally {
      db.close()
    }
  }
}
