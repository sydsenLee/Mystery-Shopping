// Per-person screen state: the exercise you are working on and the active filters.
// Kept in browser storage only as a convenience; the app works without it.

import { useSyncExternalStore } from 'react';
import type { ID } from '../lib/types';

export interface Filters {
  dealershipIds: ID[];
  regions: string[];
  dateFrom: string;
  dateTo: string;
  sectionIds: ID[];
  questionIds: ID[];
  includeInProgress: boolean;
}

export const defaultFilters = (): Filters => ({ dealershipIds: [], regions: [], dateFrom: '', dateTo: '', sectionIds: [], questionIds: [], includeInProgress: false });

interface UiState {
  exerciseId: ID | null;
  oemFilter: ID | null;
  filters: Filters;
  /** Visit open on the capture screen, per exercise. */
  captureVisit: Record<ID, ID>;
  thresholds: { good: number; fair: number };
}

const KEY = 'msm-ui-v1';
function load(): UiState {
  const base: UiState = { exerciseId: null, oemFilter: null, filters: defaultFilters(), captureVisit: {}, thresholds: { good: 80, fair: 60 } };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UiState>;
      return { ...base, ...parsed, filters: { ...base.filters, ...parsed.filters } };
    }
  } catch {
    /* storage unavailable */
  }
  return base;
}

let ui = load();
const listeners = new Set<() => void>();

export function setUi(patch: Partial<UiState>) {
  ui = { ...ui, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(ui));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useUi<T>(select: (s: UiState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(ui),
  );
}
export const getUi = () => ui;

export function selectExercise(id: ID | null) {
  // Filters are specific to an exercise's dealers and questions.
  if (id !== ui.exerciseId) setUi({ exerciseId: id, filters: { ...defaultFilters(), includeInProgress: ui.filters.includeInProgress } });
}

export function setFilters(patch: Partial<Filters>) {
  setUi({ filters: { ...ui.filters, ...patch } });
}

export function rememberCaptureVisit(exerciseId: ID, visitId: ID) {
  setUi({ captureVisit: { ...ui.captureVisit, [exerciseId]: visitId } });
}
