/*
 * File des saisies hors-ligne (SPEC §12.10, OFF-02, OFF-05, OFF-08) : IndexedDB, une base par appareil. Chaque
 * saisie porte l'ID client qui sert de clé d'idempotence côté serveur (D-15). Une saisie refusée au rejeu reste dans
 * la file, marquée « à revoir » avec sa raison : elle n'est jamais perdue en silence.
 */

export type OutboxKind = 'journal' | 'harvest';
export type OutboxItem = {
  /** ID client de la saisie (UUID), aussi clé de la file. */
  id: string;
  kind: OutboxKind;
  /** Entrée de la Server Action, `clientId` et `capturedAt` compris. */
  input: Record<string, unknown>;
  /** Libellé lisible (« Observation — Tomate »), pour la liste des saisies à revoir. */
  label: string;
  createdAt: string;
  status: 'pending' | 'rejected';
  /** Clé d'erreur (namespace `errors`) quand la saisie a été refusée. */
  error?: string;
};

const DB = 'greenu-offline';
const STORE = 'outbox';
const listeners = new Set<() => void>();

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
    });
  } finally {
    db.close();
  }
}

/** Prévient les composants abonnés (compteur, liste), y compris dans les autres onglets. */
function changed() {
  listeners.forEach((l) => l());
  try { new BroadcastChannel(DB).postMessage('changed'); } catch { /* navigateur sans BroadcastChannel */ }
}

export function onOutboxChange(fn: () => void): () => void {
  listeners.add(fn);
  let channel: BroadcastChannel | null = null;
  try { channel = new BroadcastChannel(DB); channel.onmessage = () => fn(); } catch { /* idem */ }
  return () => { listeners.delete(fn); channel?.close(); };
}

export async function enqueue(item: Omit<OutboxItem, 'createdAt' | 'status'>): Promise<void> {
  await run('readwrite', (s) => s.put({ ...item, createdAt: new Date().toISOString(), status: 'pending' } satisfies OutboxItem));
  changed();
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const all = await run<OutboxItem[]>('readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>); // as: le magasin ne contient que des OutboxItem
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeFromOutbox(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
  changed();
}

export async function markRejected(item: OutboxItem, error: string): Promise<void> {
  await run('readwrite', (s) => s.put({ ...item, status: 'rejected', error } satisfies OutboxItem));
  changed();
}

export async function retry(item: OutboxItem): Promise<void> {
  const { error: _error, ...rest } = item;
  await run('readwrite', (s) => s.put({ ...rest, status: 'pending' } satisfies OutboxItem));
  changed();
}

/** Déconnexion (OFF-08) : la file de cet appareil est vidée. */
export async function clearOutbox(): Promise<void> {
  await run('readwrite', (s) => s.clear());
  changed();
}

/** Une Server Action qui n'a pas pu joindre le serveur lève une erreur réseau (et non un résultat d'erreur). */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && /fetch|network|Failed to fetch|Load failed/i.test(e.message));
}
