import { useMemo } from 'react';
import { buildReport } from '../lib/report';
import { useData } from './store';
import { useUi } from './ui';

export function useCurrentExercise() {
  const data = useData();
  const exerciseId = useUi((s) => s.exerciseId);
  return useMemo(() => {
    const exercise = data.exercises.find((e) => e.id === exerciseId) ?? null;
    const oem = exercise ? data.oems.find((o) => o.id === exercise.oemId) : undefined;
    return { exercise, oem };
  }, [data, exerciseId]);
}

/** The filtered report for the current exercise. Shared by Blood Chart, Analytics and Reports. */
export function useReport() {
  const data = useData();
  const exerciseId = useUi((s) => s.exerciseId);
  const filters = useUi((s) => s.filters);
  return useMemo(() => (exerciseId ? buildReport(data, { exerciseId, ...filters }) : null), [data, exerciseId, filters]);
}
