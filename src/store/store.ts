import { useSyncExternalStore } from 'react';
import { COLLECTION_NAMES, type CollectionName, type Collections } from '../lib/types';
import { emptyCollections, pickAdapter, type RemoteChange, type StorageAdapter } from './adapters';

type Entity = { id: string };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface State {
  ready: boolean;
  data: Collections;
  save: SaveState;
  saveError?: string;
  storage?: StorageAdapter;
  storageWarning?: string;
}

let state: State = { ready: false, data: emptyCollections(), save: 'idle' };
const listeners = new Set<() => void>();

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}
export const useData = () => useStore((s) => s.data);
export const getData = () => state.data;

// ---------------------------------------------------------------------------
// Write queue: one write at a time per record, always the latest value.
// Rapid clicks on the same visit collapse into a single save.

interface Pending {
  collection: CollectionName;
  value: Entity | null; // null = delete
  timer?: ReturnType<typeof setTimeout>;
  inflight?: boolean;
  dirty?: boolean;
}
const pending = new Map<string, Pending>();
const DEBOUNCE_MS = 350;

function updateSaveState() {
  const busy = [...pending.values()].some((p) => p.inflight || p.timer || p.dirty);
  if (busy) {
    if (state.save !== 'saving' && state.save !== 'error') setState({ save: 'saving' });
  } else if (state.save === 'saving') setState({ save: 'saved' });
}

function queueWrite(collection: CollectionName, id: string, value: Entity | null, immediate = false) {
  const key = `${collection}/${id}`;
  const p = pending.get(key) ?? { collection, value };
  p.value = value;
  p.dirty = true;
  pending.set(key, p);
  if (p.timer) clearTimeout(p.timer);
  p.timer = setTimeout(() => flushKey(key), immediate ? 0 : DEBOUNCE_MS);
  updateSaveState();
}

async function flushKey(key: string) {
  const p = pending.get(key);
  const adapter = state.storage;
  if (!p || !adapter) return;
  p.timer = undefined;
  if (p.inflight) return; // the running write re-checks `dirty` when it finishes
  p.inflight = true;
  while (p.dirty) {
    p.dirty = false;
    const value = p.value;
    try {
      if (value) await adapter.put(p.collection, value);
      else await adapter.remove(p.collection, key.slice(key.indexOf('/') + 1));
      if (state.save === 'error') setState({ save: 'saving', saveError: undefined });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const msg =
        code === 'quota_exceeded'
          ? 'Storage is full. Delete old sample data or export a backup and remove old exercises.'
          : code === 'invalid_argument'
            ? 'You can view this page but not change it. Ask the owner for edit access.'
            : 'Could not save. Check your connection; changes will retry on your next edit.';
      setState({ save: 'error', saveError: msg });
      p.dirty = true;
      break;
    }
  }
  p.inflight = false;
  if (!p.dirty) pending.delete(key);
  updateSaveState();
}

export function flushAll() {
  for (const key of pending.keys()) {
    const p = pending.get(key)!;
    if (p.timer) clearTimeout(p.timer);
    void flushKey(key);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if ([...pending.values()].some((p) => p.dirty || p.inflight)) {
      flushAll();
      e.preventDefault();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
}

// ---------------------------------------------------------------------------
// Mutations

export function upsert<C extends CollectionName>(collection: C, entity: Collections[C][number], opts?: { immediate?: boolean }) {
  const list = state.data[collection] as Entity[];
  const idx = list.findIndex((x) => x.id === entity.id);
  const next = idx >= 0 ? list.map((x, i) => (i === idx ? entity : x)) : [...list, entity];
  setState({ data: { ...state.data, [collection]: next } });
  queueWrite(collection, entity.id, entity, opts?.immediate);
}

export function upsertMany<C extends CollectionName>(collection: C, entities: Collections[C][number][]) {
  const map = new Map((state.data[collection] as Entity[]).map((x) => [x.id, x]));
  for (const e of entities) map.set(e.id, e);
  setState({ data: { ...state.data, [collection]: [...map.values()] } });
  for (const e of entities) queueWrite(collection, e.id, e, true);
}

export function remove(collection: CollectionName, id: string) {
  setState({ data: { ...state.data, [collection]: (state.data[collection] as Entity[]).filter((x) => x.id !== id) } });
  queueWrite(collection, id, null, true);
}

export function removeMany(collection: CollectionName, ids: string[]) {
  const s = new Set(ids);
  setState({ data: { ...state.data, [collection]: (state.data[collection] as Entity[]).filter((x) => !s.has(x.id)) } });
  for (const id of ids) queueWrite(collection, id, null, true);
}

/** Replace everything (restore from backup). */
export function replaceAll(data: Collections) {
  for (const col of COLLECTION_NAMES) {
    const incoming = new Set((data[col] as Entity[]).map((x) => x.id));
    for (const old of state.data[col] as Entity[]) if (!incoming.has(old.id)) queueWrite(col, old.id, null, true);
    for (const e of data[col] as Entity[]) queueWrite(col, e.id, e, true);
  }
  setState({ data: { ...emptyCollections(), ...data } });
}

function applyRemote(changes: RemoteChange[]) {
  let data = state.data;
  for (const ch of changes) {
    // Local edits that have not been saved yet win over echoes from the server.
    if (pending.has(`${ch.collection}/${ch.entity.id}`)) continue;
    const list = data[ch.collection] as Entity[];
    const idx = list.findIndex((x) => x.id === ch.entity.id);
    if (ch.type === 'remove') {
      if (idx >= 0) data = { ...data, [ch.collection]: list.filter((x) => x.id !== ch.entity.id) };
    } else if (idx < 0) data = { ...data, [ch.collection]: [...list, ch.entity] };
    else if (JSON.stringify(list[idx]) !== JSON.stringify(ch.entity)) data = { ...data, [ch.collection]: list.map((x, i) => (i === idx ? ch.entity : x)) };
  }
  if (data !== state.data) setState({ data });
}

let initStarted = false;
export async function initStore() {
  if (initStarted) return;
  initStarted = true;
  const { adapter, warning } = await pickAdapter();
  let data = emptyCollections();
  try {
    data = { ...data, ...(await adapter.load()) };
  } catch {
    setState({ storageWarning: 'Saved data could not be loaded. Check your connection and reload the page.' });
  }
  setState({ ready: true, data, storage: adapter, storageWarning: warning ?? state.storageWarning });
  adapter.watch?.(applyRemote);
}

export function uid(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}
export const nowIso = () => new Date().toISOString();
