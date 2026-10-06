// Builds the full result set for an exercise from the filters.
// The Blood Chart, Analytics, Reports page and every export use this one model.

import {
  buildContext,
  isScored,
  poolTally,
  questionTally,
  ratingAverage,
  sectionTally,
  visitTally,
  emptyTally,
  addTally,
  finishTally,
  type AnalysisContext,
  type NumberedQuestion,
  type Tally,
} from './calc';
import type { Collections, Dealership, Exercise, ID, Oem, QuestionnaireVersion, Section, Visit } from './types';

export interface ReportFilters {
  exerciseId: ID;
  dealershipIds?: ID[];
  regions?: string[];
  dateFrom?: string;
  dateTo?: string;
  sectionIds?: ID[];
  questionIds?: ID[];
  includeInProgress: boolean;
}

export interface QuestionRow {
  nq: NumberedQuestion;
  tally: Tally;
  scored: boolean;
  rating?: { avg: number | null; n: number };
  /** Non-compliant answers (No on a normal question, Yes on a reverse question). */
  misses: number;
}

export interface SectionRow {
  section: Section;
  index: number;
  tally: Tally;
}

export interface VisitRow {
  visit: Visit;
  dealership?: Dealership;
  label: string;
  tally: Tally;
  sections: Map<ID, Tally>;
}

export interface DealerRow {
  dealership?: Dealership;
  dealershipId: ID;
  name: string;
  visits: VisitRow[];
  tally: Tally;
  sections: Map<ID, Tally>;
}

export interface ExerciseReport {
  exercise: Exercise;
  oem?: Oem;
  versions: QuestionnaireVersion[];
  ctx: AnalysisContext;
  filters: ReportFilters;
  allVisits: Visit[];
  visits: Visit[];
  excludedInProgress: number;
  sections: SectionRow[];
  questions: QuestionRow[];
  visitRows: VisitRow[];
  dealerRows: DealerRow[];
  overall: Tally;
  best?: VisitRow;
  worst?: VisitRow;
  strengths: QuestionRow[];
  gaps: QuestionRow[];
  perfect: QuestionRow[];
  mostMissed: QuestionRow[];
}

export function dealerName(d: Dealership | undefined) {
  return d?.name ?? 'Unknown dealership';
}

export function visitDisplayLabels(visits: Visit[], dealers: Map<ID, Dealership>): Map<ID, string> {
  // Repeated dealerships get "(visit 2)" so each column stays identifiable.
  const counts = new Map<ID, number>();
  for (const v of visits) counts.set(v.dealershipId, (counts.get(v.dealershipId) ?? 0) + 1);
  const seen = new Map<ID, number>();
  const out = new Map<ID, string>();
  for (const v of visits) {
    const name = dealerName(dealers.get(v.dealershipId));
    if ((counts.get(v.dealershipId) ?? 0) > 1) {
      const n = (seen.get(v.dealershipId) ?? 0) + 1;
      seen.set(v.dealershipId, n);
      out.set(v.id, `${name} (visit ${n})`);
    } else out.set(v.id, name);
  }
  return out;
}

export function sortVisits(visits: Visit[]): Visit[] {
  return [...visits].sort((a, b) => (a.visitDate ?? '').localeCompare(b.visitDate ?? '') || a.createdAt.localeCompare(b.createdAt));
}

export function filterVisits(all: Visit[], f: ReportFilters, dealers: Map<ID, Dealership>): Visit[] {
  return all.filter((v) => {
    if (!f.includeInProgress && v.status !== 'complete') return false;
    if (f.dealershipIds?.length && !f.dealershipIds.includes(v.dealershipId)) return false;
    if (f.regions?.length) {
      const r = dealers.get(v.dealershipId)?.region ?? '';
      if (!f.regions.includes(r)) return false;
    }
    if (f.dateFrom && (!v.visitDate || v.visitDate < f.dateFrom)) return false;
    if (f.dateTo && (!v.visitDate || v.visitDate > f.dateTo)) return false;
    return true;
  });
}

export function buildReport(data: Collections, filters: ReportFilters): ExerciseReport | null {
  const exercise = data.exercises.find((e) => e.id === filters.exerciseId);
  if (!exercise) return null;
  const oem = data.oems.find((o) => o.id === exercise.oemId);
  const versions = data.versions.filter((v) => v.exerciseId === exercise.id).sort((a, b) => a.version - b.version);
  const dealers = new Map(data.dealerships.map((d) => [d.id, d]));
  const allVisits = sortVisits(data.visits.filter((v) => v.exerciseId === exercise.id));
  const scopeVisits = filterVisits(allVisits, { ...filters, includeInProgress: true }, dealers);
  const visits = filters.includeInProgress ? scopeVisits : scopeVisits.filter((v) => v.status === 'complete');
  const excludedInProgress = scopeVisits.length - visits.length;
  const ctx = buildContext(versions, allVisits);

  const sectionSet = filters.sectionIds?.length ? new Set(filters.sectionIds) : undefined;
  const questionSet = filters.questionIds?.length ? new Set(filters.questionIds) : undefined;
  const qFilter = { sectionIds: sectionSet, questionIds: questionSet };

  const sections: SectionRow[] = ctx.sections
    .map((section, index) => ({ section, index, tally: sectionTally(ctx, section.id, visits, questionSet) }))
    .filter((s) => !sectionSet || sectionSet.has(s.section.id));

  const questions: QuestionRow[] = ctx.numbered
    .filter((nq) => (!sectionSet || sectionSet.has(nq.section.id)) && (!questionSet || questionSet.has(nq.q.id) || (nq.q.isGroup && hasChildIn(ctx, nq.q.id, questionSet))))
    .map((nq) => {
      const scored = isScored(nq.q);
      const tally = scored ? questionTally(ctx, nq.q, visits) : emptyTally();
      return {
        nq,
        tally,
        scored,
        rating: nq.q.type === 'rating5' ? ratingAverage(ctx, nq.q, visits) : undefined,
        misses: tally.valid - tally.compliant,
      };
    });

  const labels = visitDisplayLabels(visits, dealers);
  const visitRows: VisitRow[] = visits.map((visit) => {
    const sec = new Map<ID, Tally>();
    for (const s of sections) sec.set(s.section.id, visitTally(ctx, visit, { sectionIds: new Set([s.section.id]), questionIds: questionSet }));
    return { visit, dealership: dealers.get(visit.dealershipId), label: labels.get(visit.id) ?? '', tally: visitTally(ctx, visit, qFilter), sections: sec };
  });

  const byDealer = new Map<ID, DealerRow>();
  for (const vr of visitRows) {
    let row = byDealer.get(vr.visit.dealershipId);
    if (!row) {
      row = { dealership: vr.dealership, dealershipId: vr.visit.dealershipId, name: dealerName(vr.dealership), visits: [], tally: emptyTally(), sections: new Map() };
      byDealer.set(vr.visit.dealershipId, row);
    }
    row.visits.push(vr);
    addTally(row.tally, vr.tally);
    for (const [sid, t] of vr.sections) {
      const cur = row.sections.get(sid) ?? emptyTally();
      row.sections.set(sid, addTally(cur, t));
    }
  }
  const dealerRows = [...byDealer.values()].map((r) => ({ ...r, tally: finishTally(r.tally) })).sort(byPctDesc((r) => r.tally));

  const overall = poolTally(ctx, visits, qFilter);
  const ranked = visitRows.filter((r) => r.tally.pct !== null).sort(byPctDesc((r) => r.tally));
  const scoredQs = questions.filter((q) => q.scored && q.tally.pct !== null && !q.nq.q.isGroup);

  return {
    exercise,
    oem,
    versions,
    ctx,
    filters,
    allVisits,
    visits,
    excludedInProgress,
    sections,
    questions,
    visitRows,
    dealerRows,
    overall,
    best: ranked[0],
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : undefined,
    strengths: [...scoredQs].sort(byPctDesc((q) => q.tally)).slice(0, 5),
    gaps: [...scoredQs].sort((a, b) => (a.tally.pct ?? 0) - (b.tally.pct ?? 0) || b.tally.valid - a.tally.valid).slice(0, 5),
    perfect: scoredQs.filter((q) => q.tally.pct === 100),
    mostMissed: [...scoredQs].filter((q) => q.misses > 0).sort((a, b) => b.misses - a.misses || (a.tally.pct ?? 0) - (b.tally.pct ?? 0)).slice(0, 5),
  };
}

function hasChildIn(ctx: AnalysisContext, parentId: ID, set: Set<ID>) {
  return ctx.numbered.some((n) => n.q.parentId === parentId && set.has(n.q.id));
}

function byPctDesc<T>(get: (x: T) => Tally) {
  return (a: T, b: T) => (get(b).pct ?? -1) - (get(a).pct ?? -1) || get(b).valid - get(a).valid;
}

/** Headline figures for the exercise list (completed visits only, no other filters). */
export function exerciseSummary(data: Collections, exerciseId: ID) {
  const r = buildReport(data, { exerciseId, includeInProgress: false });
  const all = data.visits.filter((v) => v.exerciseId === exerciseId);
  return {
    visits: all.length,
    completed: all.filter((v) => v.status === 'complete').length,
    pct: r?.overall.pct ?? null,
    sections: r?.sections ?? [],
  };
}

export function periodLabel(e: Exercise): string {
  const f = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  if (e.periodStart && e.periodEnd) return `${f(e.periodStart)} to ${f(e.periodEnd)}`;
  return f(e.periodStart) || f(e.periodEnd) || 'No period set';
}
