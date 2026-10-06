// Storage adapters. The app keeps all data in memory and writes each changed record
// through one of these. Swapping in a server database later only needs a new adapter.

import { createStore, entries, set, del, clear } from 'idb-keyval';
import { COLLECTION_NAMES, type CollectionName, type Collections } from '../lib/types';

type Entity = { id: string };

export interface RemoteChange {
  collection: CollectionName;
  type: 'upsert' | 'remove';
  entity: Entity;
}

export interface StorageAdapter {
  kind: 'browser' | 'cloud' | 'memory';
  /** Shown in Settings so it is clear where data lives. */
  description: string;
  load(): Promise<Collections>;
  put(collection: CollectionName, entity: Entity): Promise<void>;
  remove(collection: CollectionName, id: string): Promise<void>;
  /** Live changes made by other people or other tabs. */
  watch?(onChange: (changes: RemoteChange[]) => void): () => void;
  clearAll?(): Promise<void>;
}

export const emptyCollections = (): Collections => ({ oems: [], dealerships: [], exercises: [], versions: [], visits: [], templates: [] });

// ---------------------------------------------------------------------------
// Browser (IndexedDB). Used when the app is hosted as a normal website.

export function browserAdapter(): StorageAdapter {
  const store = createStore('mystery-shopping', 'records');
  return {
    kind: 'browser',
    description: 'Saved in this browser on this device (IndexedDB). Use Settings > Backup to move data between devices.',
    async load() {
      const out = emptyCollections();
      for (const [key, value] of await entries(store)) {
        const [col] = String(key).split('/');
        if ((COLLECTION_NAMES as string[]).includes(col)) (out[col as CollectionName] as Entity[]).push(value as Entity);
      }
      return out;
    },
    put: (c, e) => set(`${c}/${e.id}`, e, store),
    remove: (c, id) => del(`${c}/${id}`, store),
    clearAll: () => clear(store),
  };
}

export function memoryAdapter(): StorageAdapter {
  return {
    kind: 'memory',
    description: 'Not saved. This browser blocks storage, so data is lost when the page closes. Export a backup before leaving.',
    load: async () => emptyCollections(),
    put: async () => {},
    remove: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Cloud (shared document store available when the app runs as a published Claude page).

interface DbSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { hasPendingWrites: boolean };
}
interface DbQuery {
  where(f: string, op: string, v: unknown): DbQuery;
  orderBy(f: string, dir?: 'asc' | 'desc'): DbQuery;
  limit(n: number): DbQuery;
  get(): Promise<{ docs: DbSnap[] }>;
  onSnapshot(
    next: (s: { docs: DbSnap[]; docChanges(): { type: 'added' | 'modified' | 'removed'; doc: DbSnap }[]; metadata: { hasPendingWrites: boolean } }) => void,
    err?: (e: { code: string }) => void,
  ): () => void;
}
interface DbCollection extends DbQuery {
  doc(id: string): { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> };
}
export interface ClaudeDb {
  collection(path: string): DbCollection;
}

const PAGE = 500;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if ((e as { code?: string })?.code === 'unavailable') {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 800));
      return fn();
    }
    throw e;
  }
}

const strip = (d: Record<string, unknown> | undefined): Entity => {
  const { _k, ...rest } = d ?? {};
  void _k;
  return rest as unknown as Entity;
};

export function cloudAdapter(db: ClaudeDb): StorageAdapter {
  return {
    kind: 'cloud',
    description: 'Saved online with this page. Everyone you share it with as an editor sees the same exercises and results.',
    async load() {
      const out = emptyCollections();
      for (const col of COLLECTION_NAMES) {
        let last = '';
        for (;;) {
          let q = db.collection(col).orderBy('_k').limit(PAGE);
          if (last) q = q.where('_k', '>', last);
          const snap = await withRetry(() => q.get());
          for (const d of snap.docs) (out[col] as Entity[]).push(strip(d.data()));
          if (snap.docs.length < PAGE) break;
          last = snap.docs[snap.docs.length - 1].id;
        }
      }
      return out;
    },
    put: (c, e) => withRetry(() => db.collection(c).doc(e.id).set({ ...(JSON.parse(JSON.stringify(e)) as Record<string, unknown>), _k: e.id })),
    remove: (c, id) => withRetry(() => db.collection(c).doc(id).delete()),
    watch(onChange) {
      const unsubs = COLLECTION_NAMES.map((col) =>
        db.collection(col).onSnapshot(
          (snap) => {
            const changes: RemoteChange[] = [];
            for (const ch of snap.docChanges()) {
              if (ch.doc.metadata.hasPendingWrites) continue;
              changes.push({ collection: col, type: ch.type === 'removed' ? 'remove' : 'upsert', entity: ch.type === 'removed' ? { id: ch.doc.id } : strip(ch.doc.data()) });
            }
            if (changes.length) onChange(changes);
          },
          () => {},
        ),
      );
      return () => unsubs.forEach((u) => u());
    },
  };
}

// ---------------------------------------------------------------------------

declare global {
  interface Window {
    claude?: { use?: (name: string) => Promise<unknown> };
  }
}

/** Picks the cloud store when running as a published page, otherwise the browser store. */
export async function pickAdapter(): Promise<{ adapter: StorageAdapter; warning?: string }> {
  if (typeof window !== 'undefined' && typeof window.claude?.use === 'function') {
    try {
      const db = (await window.claude.use('db')) as ClaudeDb | null;
      if (db) return { adapter: cloudAdapter(db) };
    } catch {
      /* fall through */
    }
    return { adapter: await browserOrMemory(), warning: 'Online storage is not available for you on this page, so your work is saved in this browser only.' };
  }
  return { adapter: await browserOrMemory() };
}

async function browserOrMemory(): Promise<StorageAdapter> {
  try {
    const a = browserAdapter();
    await a.load();
    return a;
  } catch {
    return memoryAdapter();
  }
}
