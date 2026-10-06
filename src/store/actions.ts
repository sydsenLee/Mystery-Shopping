// Business operations. Pages call these instead of editing records directly.

import { BUILT_IN_TEMPLATES } from '../lib/templates';
import type { Dealership, Exercise, ID, Oem, QuestionnaireVersion, ResponseValue, Section, Template, Visit } from '../lib/types';
import { getData, nowIso, remove, removeMany, uid, upsert, upsertMany } from './store';

// ---------------------------------------------------------------------------
// OEMs and dealerships

export function findOrCreateOem(name: string): Oem {
  const clean = name.trim();
  const existing = getData().oems.find((o) => o.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const oem: Oem = { id: uid(), name: clean, createdAt: nowIso() };
  upsert('oems', oem, { immediate: true });
  return oem;
}

export const normaliseName = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Finds a dealership by name (case-insensitive) or creates it, so spelling stays consistent. */
export function findOrCreateDealership(name: string, extra: Partial<Dealership> = {}): Dealership {
  const clean = normaliseName(name);
  const existing = getData().dealerships.find((d) => d.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const d: Dealership = { id: uid(), name: clean, createdAt: nowIso(), ...extra };
  upsert('dealerships', d, { immediate: true });
  return d;
}

// ---------------------------------------------------------------------------
// Questionnaires

/** Copies sections with fresh ids (parent links kept). */
export function cloneSections(sections: Section[]): Section[] {
  const map = new Map<ID, ID>();
  for (const s of sections) for (const q of s.questions) map.set(q.id, uid());
  return sections.map((s) => ({
    id: uid(),
    title: s.title,
    questions: s.questions.map((q) => ({ ...q, id: map.get(q.id)!, parentId: q.parentId ? map.get(q.parentId) : undefined })),
  }));
}

export function allTemplates(): Template[] {
  return [...BUILT_IN_TEMPLATES, ...getData().templates];
}

export function exerciseVersions(exerciseId: ID): QuestionnaireVersion[] {
  return getData()
    .versions.filter((v) => v.exerciseId === exerciseId)
    .sort((a, b) => a.version - b.version);
}

export function latestVersion(exerciseId: ID): QuestionnaireVersion | undefined {
  const vs = exerciseVersions(exerciseId);
  return vs[vs.length - 1];
}

/** A version is locked once any visit has recorded an answer against it. */
export function versionUsage(versionId: ID) {
  const visits = getData().visits.filter((v) => v.questionnaireVersionId === versionId);
  const answered = visits.filter((v) => Object.keys(v.responses).length > 0 || v.status === 'complete');
  return { visits: visits.length, answered: answered.length, locked: answered.length > 0 };
}

/**
 * Saves questionnaire edits. If the current version has answers recorded against it,
 * a new version is created so historical visits keep the questions they were scored on.
 * Visits with no answers yet move to the new version.
 */
export function saveQuestionnaire(exerciseId: ID, sections: Section[], note?: string): QuestionnaireVersion {
  const current = latestVersion(exerciseId);
  if (current && !versionUsage(current.id).locked) {
    const updated = { ...current, sections };
    upsert('versions', updated);
    return updated;
  }
  const next: QuestionnaireVersion = { id: uid(), exerciseId, version: (current?.version ?? 0) + 1, sections, createdAt: nowIso(), note };
  upsert('versions', next, { immediate: true });
  const emptyVisits = getData().visits.filter((v) => v.exerciseId === exerciseId && v.questionnaireVersionId !== next.id && Object.keys(v.responses).length === 0 && v.status !== 'complete');
  if (emptyVisits.length) upsertMany('visits', emptyVisits.map((v) => ({ ...v, questionnaireVersionId: next.id, updatedAt: nowIso() })));
  return next;
}

export function saveAsTemplate(name: string, sections: Section[], description?: string) {
  const t: Template = { id: uid(), name, description, sections: cloneSections(sections), createdAt: nowIso() };
  upsert('templates', t, { immediate: true });
  return t;
}

// ---------------------------------------------------------------------------
// Exercises

export interface NewExerciseInput {
  oemName: string;
  name: string;
  periodStart?: string;
  periodEnd?: string;
  region?: string;
  notes?: string;
  /** Template id, or "exercise:<id>" to copy another exercise's latest questionnaire. */
  source: string;
}

export function createExercise(input: NewExerciseInput): Exercise {
  const oem = findOrCreateOem(input.oemName);
  const t = nowIso();
  const ex: Exercise = {
    id: uid(),
    oemId: oem.id,
    name: input.name.trim(),
    periodStart: input.periodStart || undefined,
    periodEnd: input.periodEnd || undefined,
    region: input.region?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    status: 'active',
    createdAt: t,
    updatedAt: t,
  };
  upsert('exercises', ex, { immediate: true });
  let sections: Section[] = [];
  if (input.source.startsWith('exercise:')) sections = latestVersion(input.source.slice(9))?.sections ?? [];
  else sections = allTemplates().find((x) => x.id === input.source)?.sections ?? [];
  if (sections.length === 0) sections = [{ id: 'x', title: 'Section 1', questions: [] }];
  upsert('versions', { id: uid(), exerciseId: ex.id, version: 1, sections: cloneSections(sections), createdAt: t }, { immediate: true });
  return ex;
}

export function updateExercise(ex: Exercise, patch: Partial<Exercise>) {
  upsert('exercises', { ...ex, ...patch, updatedAt: nowIso() });
}

export function deleteExercise(id: ID) {
  const d = getData();
  removeMany('visits', d.visits.filter((v) => v.exerciseId === id).map((v) => v.id));
  removeMany('versions', d.versions.filter((v) => v.exerciseId === id).map((v) => v.id));
  remove('exercises', id);
}

// ---------------------------------------------------------------------------
// Visits

export function createVisit(exerciseId: ID, dealershipId: ID, extra: Partial<Visit> = {}): Visit {
  const ver = latestVersion(exerciseId);
  const existing = getData().visits.filter((v) => v.exerciseId === exerciseId).length;
  const t = nowIso();
  const v: Visit = {
    id: uid(),
    exerciseId,
    dealershipId,
    questionnaireVersionId: ver?.id ?? '',
    team: `Team ${existing + 1}`,
    visitDate: new Date().toISOString().slice(0, 10),
    status: 'in_progress',
    responses: {},
    createdAt: t,
    updatedAt: t,
    ...extra,
  };
  upsert('visits', v, { immediate: true });
  return v;
}

export function getVisit(id: ID) {
  return getData().visits.find((v) => v.id === id);
}

export function updateVisit(id: ID, patch: Partial<Visit>) {
  const v = getVisit(id);
  if (v) upsert('visits', { ...v, ...patch, updatedAt: nowIso() });
}

/** Records (or clears, with null) one answer. Re-opens a completed visit if a required answer is cleared. */
export function setResponse(visitId: ID, questionId: ID, value: ResponseValue | null, comment?: string) {
  const v = getVisit(visitId);
  if (!v) return;
  const responses = { ...v.responses };
  const prev = responses[questionId];
  if (value === null || value === '') {
    if (prev?.comment && comment === undefined) responses[questionId] = { value: '', comment: prev.comment, at: nowIso() };
    else delete responses[questionId];
  } else responses[questionId] = { value, comment: comment ?? prev?.comment, at: nowIso() };
  upsert('visits', { ...v, responses, updatedAt: nowIso() });
}

export function setComment(visitId: ID, questionId: ID, comment: string) {
  const v = getVisit(visitId);
  if (!v) return;
  const prev = v.responses[questionId];
  const responses = { ...v.responses };
  if (!comment && (!prev || prev.value === '')) delete responses[questionId];
  else responses[questionId] = { value: prev?.value ?? '', comment: comment || undefined, at: nowIso() };
  upsert('visits', { ...v, responses, updatedAt: nowIso() });
}

/** Moves a visit to the newest questionnaire version, keeping answers to questions that still exist. */
export function upgradeVisit(visitId: ID) {
  const v = getVisit(visitId);
  if (!v) return;
  const latest = latestVersion(v.exerciseId);
  if (!latest || latest.id === v.questionnaireVersionId) return;
  const keep = new Set(latest.sections.flatMap((s) => s.questions.map((q) => q.id)));
  const responses = Object.fromEntries(Object.entries(v.responses).filter(([k]) => keep.has(k)));
  upsert('visits', { ...v, questionnaireVersionId: latest.id, responses, status: 'in_progress', completedAt: undefined, updatedAt: nowIso() });
}

export function deleteVisit(id: ID) {
  remove('visits', id);
}

// ---------------------------------------------------------------------------
// Sample data, clearly marked, so a new user can see a filled-in Blood Chart.

export const SAMPLE_PREFIX = 'sample-';

export function hasSampleData() {
  return getData().exercises.some((e) => e.id.startsWith(SAMPLE_PREFIX));
}

export function loadSampleData() {
  const t = nowIso();
  const oem: Oem = { id: SAMPLE_PREFIX + 'oem', name: 'Sample OEM', color: '#1f5fbf', createdAt: t };
  const names = [
    'Jetour Menlyn', 'Haval Menlyn', 'Kia Menlyn', 'Land Rover Menlyn', 'Land Rover Menlyn', 'Nissan Menlyn', 'GM Menlyn',
    'GWM Menlyn', 'Tata Menlyn', 'Renault Centurion', 'Hyundai Centurion', 'Hyundai Centurion', 'Nissan Menlyn',
    'Nissan Centurion', 'GWM Menlyn', 'Jetour Menlyn', 'GWM Menlyn', 'VW Menlyn', 'Ford Menlyn',
  ];
  const dealers = new Map<string, Dealership>();
  for (const n of names) {
    if (dealers.has(n)) continue;
    const existing = getData().dealerships.find((d) => d.name.toLowerCase() === n.toLowerCase());
    dealers.set(n, existing ?? { id: SAMPLE_PREFIX + 'd-' + n.toLowerCase().replace(/\W+/g, '-'), name: n, region: n.includes('Centurion') ? 'Centurion' : 'Menlyn', city: 'Pretoria', createdAt: t });
  }
  const ex: Exercise = {
    id: SAMPLE_PREFIX + 'ex',
    oemId: oem.id,
    name: 'Sample: Pretoria East Showroom Benchmark',
    periodStart: '2026-04-01',
    periodEnd: '2026-04-09',
    region: 'Gauteng',
    notes: 'Example data for trying out the system. Dealer names come from the April 2026 Blood Chart; the answers are made up. Delete it in Settings.',
    status: 'closed',
    createdAt: t,
    updatedAt: t,
  };
  const sections = cloneSections(BUILT_IN_TEMPLATES[0].sections);
  const ver: QuestionnaireVersion = { id: SAMPLE_PREFIX + 'v1', exerciseId: ex.id, version: 1, sections, createdAt: t };
  // Deterministic pseudo-random answers so the sample looks the same every time.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cihyTeams = new Set([1, 6, 11, 16, 17, 18, 19]); // "x" marks in the original sheet
  const qs = sections.flatMap((s) => s.questions).filter((q) => !q.isGroup);
  const visits: Visit[] = names.map((n, i) => {
    const skill = 0.45 + rnd() * 0.5;
    const responses: Visit['responses'] = {};
    for (const q of qs) {
      if (q.reverse) responses[q.id] = { value: cihyTeams.has(i + 1) ? 'yes' : 'no', at: t };
      else if (i === 18 && rnd() < 0.3) continue; // last visit still being captured
      else responses[q.id] = { value: rnd() < skill + (q.text.includes('clean') ? 0.3 : 0) ? 'yes' : 'no', at: t };
    }
    return {
      id: `${SAMPLE_PREFIX}visit-${i + 1}`,
      exerciseId: ex.id,
      dealershipId: dealers.get(n)!.id,
      questionnaireVersionId: ver.id,
      team: `Team ${i + 1}`,
      visitDate: `2026-04-0${1 + Math.floor(i / 3)}`,
      status: i === 18 ? 'in_progress' : 'complete',
      responses,
      createdAt: new Date(Date.parse(t) + i * 1000).toISOString(),
      updatedAt: t,
      completedAt: i === 18 ? undefined : t,
    };
  });
  upsert('oems', oem, { immediate: true });
  upsertMany('dealerships', [...dealers.values()].filter((d) => d.id.startsWith(SAMPLE_PREFIX)));
  upsert('exercises', ex, { immediate: true });
  upsert('versions', ver, { immediate: true });
  upsertMany('visits', visits);
  return ex;
}

export function deleteSampleData() {
  const d = getData();
  const isSample = (x: { id: string }) => x.id.startsWith(SAMPLE_PREFIX);
  removeMany('visits', d.visits.filter(isSample).map((x) => x.id));
  removeMany('versions', d.versions.filter(isSample).map((x) => x.id));
  removeMany('exercises', d.exercises.filter(isSample).map((x) => x.id));
  const usedElsewhere = new Set(d.visits.filter((v) => !isSample(v)).map((v) => v.dealershipId));
  removeMany('dealerships', d.dealerships.filter((x) => isSample(x) && !usedElsewhere.has(x.id)).map((x) => x.id));
  if (!d.exercises.some((e) => !isSample(e) && e.oemId === SAMPLE_PREFIX + 'oem')) remove('oems', SAMPLE_PREFIX + 'oem');
}
