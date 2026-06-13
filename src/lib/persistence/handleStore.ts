/**
 * Persistenz des FileSystemFileHandle (Weg B).
 *
 * Ein `FileSystemFileHandle` ist strukturiert-klonbar und lässt sich daher in
 * IndexedDB ablegen — so „erinnert" sich die App nach einem Reload an die zuletzt
 * verbundene Datendatei. Der Handle allein gibt aber KEIN Schreibrecht: das muss
 * nach jedem Neustart per Nutzergeste neu erteilt werden (siehe filesystem.ts /
 * Reconnect-Band).
 *
 * Bewusst eine EIGENE Datenbank, getrennt vom Snapshot-Cache (`indexeddb.ts`):
 * so bleibt die Versionierung des Snapshot-Stores unberührt.
 */

const DB_NAME = 'paks-filehandle'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'current'
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

/** Zuletzt verbundenen Handle merken. */
export async function saveHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb()
  try {
    await tx(db, 'readwrite', (store) => store.put(handle, HANDLE_KEY))
  } finally {
    db.close()
  }
}

/** Gemerkten Handle laden (null, wenn nie eine Datei verbunden war). */
export async function loadHandle(): Promise<FileSystemFileHandle | null> {
  const db = await openDb()
  try {
    const stored = await tx<unknown>(db, 'readonly', (store) =>
      store.get(HANDLE_KEY),
    )
    // Defensive: nur echte File-Handles zurückgeben.
    if (stored && typeof (stored as FileSystemHandle).kind === 'string') {
      return stored as FileSystemFileHandle
    }
    return null
  } finally {
    db.close()
  }
}

/** Verbindung vergessen (beim „Trennen"). */
export async function clearHandle(): Promise<void> {
  const db = await openDb()
  try {
    await tx(db, 'readwrite', (store) => store.delete(HANDLE_KEY))
  } finally {
    db.close()
  }
}
