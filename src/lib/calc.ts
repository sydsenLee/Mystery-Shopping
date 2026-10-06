// The single calculation engine. Every screen, chart, Excel/CSV export and PDF report
// calls these functions, so all of them always agree.
//
// Rules:
//  - Compliance % = compliant answers / valid answers x 100.
//  - Valid answers are Yes and No only. N/A and unanswered are never counted as No
//    and never enter the denominator.
//  - For a normal question Yes is compliant. For a "reverse" (negative behaviour)
//    question No is compliant.
//  - A question that is not part of the questionnaire version a visit used is ignored
//    for that visit (it is neither unanswered nor No).
//  - Group/section/overall figures are pooled: total compliant / total valid.

import type { ID, Question, QuestionnaireVersion, ResponseEntry, Section, Visit } from './types';

export type Outcome = 'yes' | 'no' | 'na' | 'unanswered' | 'not_applicable_version' | 'other';

export interface Tally {
  yes: number;
  no: number;
  na: number;
  unanswered: number;
  /** Yes + No */
  valid: number;
  /** Answers that meet the standard (Yes, or No on a reverse question). */
  compliant: number;
  /** compliant / valid x 100, or null when there are no valid answers. */
  pct: number | null;
}

export const emptyTally = (): Tally => ({ yes: 0, no: 0, na: 0, unanswered: 0, valid: 0, compliant: 0, pct: null });

export function finishTally(t: Tally): Tally {
  t.valid = t.yes + t.no;
  t.pct = t.valid > 0 ? (t.compliant / t.valid) * 100 : null;
  return t;
}

export function addTally(into: Tally, from: Tally): Tally {
  into.yes += from.yes;
  into.no += from.no;
  into.na += from.na;
  into.unanswered += from.unanswered;
  into.compliant += from.compliant;
  return finishTally(into);
}

export const isScored = (q: Question) => !q.isGroup && (q.type === 'yes_no' || q.type === 'yes_no_na');
export const isAnswerable = (q: Question) => !q.isGroup;

export function compliantValue(q: Question): 'yes' | 'no' {
  return q.reverse ? 'no' : 'yes';
}

/** Raw outcome of one question on one visit. */
export function outcomeOf(q: Question, entry: ResponseEntry | undefined): Outcome {
  if (!isAnswerable(q)) return 'other';
  if (!entry || entry.value === '' || entry.value === undefined || entry.value === null) return 'unanswered';
  if (isScored(q)) {
    if (entry.value === 'yes' || entry.value === 'no' || entry.value === 'na') return entry.value;
    return 'unanswered';
  }
  return 'other';
}

/** Add one outcome to a tally (scored questions only). */
export function countOutcome(t: Tally, q: Question, outcome: Outcome) {
  switch (outcome) {
    case 'yes':
      t.yes++;
      if (compliantValue(q) === 'yes') t.compliant++;
      break;
    case 'no':
      t.no++;
      if (compliantValue(q) === 'no') t.compliant++;
      break;
    case 'na':
      t.na++;
      break;
    case 'unanswered':
      t.unanswered++;
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Numbering

export interface NumberedQuestion {
  q: Question;
  section: Section;
  sectionIndex: number; // 0-based
  /** e.g. "5" or "5a" */
  label: string;
  /** e.g. "1.5a" (section.question) - unique across the questionnaire */
  code: string;
  depth: 0 | 1;
  /** Present in an older version only. */
  retired?: boolean;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Numbers questions per section: 1, 2, 3 ... and sub-questions 3a, 3b ... */
export function numberSections(sections: Section[], retiredIds?: Set<ID>): NumberedQuestion[] {
  const out: NumberedQuestion[] = [];
  sections.forEach((section, sectionIndex) => {
    let n = 0;
    let sub = 0;
    let parentLabel = '';
    const topIds = new Set(section.questions.filter((q) => !q.parentId).map((q) => q.id));
    for (const q of section.questions) {
      let label: string;
      let depth: 0 | 1 = 0;
      if (q.parentId && topIds.has(q.parentId)) {
        label = parentLabel + (LETTERS[sub] ?? String(sub + 1));
        sub++;
        depth = 1;
      } else {
        n++;
        sub = 0;
        parentLabel = String(n);
        label = parentLabel;
      }
      out.push({ q, section, sectionIndex, label, code: `${sectionIndex + 1}.${label}`, depth, retired: retiredIds?.has(q.id) });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Merging questionnaire versions for reporting

/**
 * Builds one reporting questionnaire for an exercise from all of its versions.
 * The newest version defines order and wording. Questions removed in later versions
 * but answered in older visits are kept (marked retired) so history is never lost.
 */
export function mergeVersions(versions: QuestionnaireVersion[]): { sections: Section[]; retired: Set<ID> } {
  const sorted = [...versions].sort((a, b) => a.version - b.version);
  if (sorted.length === 0) return { sections: [], retired: new Set() };
  const latest = sorted[sorted.length - 1];
  const sections: Section[] = latest.sections.map((s) => ({ ...s, questions: [...s.questions] }));
  const present = new Set<ID>(sections.flatMap((s) => s.questions.map((q) => q.id)));
  const retired = new Set<ID>();
  for (let i = sorted.length - 2; i >= 0; i--) {
    for (const oldSection of sorted[i].sections) {
      const missing = oldSection.questions.filter((q) => !present.has(q.id));
      if (missing.length === 0) continue;
      let target = sections.find((s) => s.id === oldSection.id);
      if (!target) {
        target = { id: oldSection.id, title: oldSection.title, questions: [] };
        sections.push(target);
      }
      for (const q of missing) {
        // A sub-question whose parent also disappeared stays attached to it.
        const parentStillThere = q.parentId ? target.questions.some((p) => p.id === q.parentId) : false;
        target.questions.push(parentStillThere || !q.parentId ? q : { ...q, parentId: undefined });
        present.add(q.id);
        retired.add(q.id);
      }
    }
  }
  return { sections, retired };
}

// ---------------------------------------------------------------------------
// Analysis context

export interface AnalysisContext {
  sections: Section[];
  numbered: NumberedQuestion[];
  /** Question ids that belong to each visit's questionnaire version. */
  visitQuestionIds: Map<ID, Set<ID>>;
}

export function buildContext(versions: QuestionnaireVersion[], visits: Visit[]): AnalysisContext {
  const { sections, retired } = mergeVersions(versions);
  const byId = new Map(versions.map((v) => [v.id, v]));
  const visitQuestionIds = new Map<ID, Set<ID>>();
  for (const v of visits) {
    const ver = byId.get(v.questionnaireVersionId);
    visitQuestionIds.set(v.id, new Set(ver ? ver.sections.flatMap((s) => s.questions.map((q) => q.id)) : []));
  }
  return { sections, numbered: numberSections(sections, retired), visitQuestionIds };
}

export function visitHasQuestion(ctx: AnalysisContext, visit: Visit, qid: ID): boolean {
  return ctx.visitQuestionIds.get(visit.id)?.has(qid) ?? false;
}

/** Outcome of a question for a visit, taking the visit's questionnaire version into account. */
export function visitOutcome(ctx: AnalysisContext, visit: Visit, q: Question): Outcome {
  if (!visitHasQuestion(ctx, visit, q.id)) return 'not_applicable_version';
  return outcomeOf(q, visit.responses[q.id]);
}

/** Compliance for one question across many visits. */
export function questionTally(ctx: AnalysisContext, q: Question, visits: Visit[]): Tally {
  const t = emptyTally();
  if (!isScored(q)) return t;
  for (const v of visits) countOutcome(t, q, visitOutcome(ctx, v, q));
  return finishTally(t);
}

/** Compliance for one visit, optionally limited to some sections / questions. */
export function visitTally(ctx: AnalysisContext, visit: Visit, filter?: { sectionIds?: Set<ID>; questionIds?: Set<ID> }): Tally {
  const t = emptyTally();
  for (const nq of ctx.numbered) {
    if (!isScored(nq.q)) continue;
    if (filter?.sectionIds && !filter.sectionIds.has(nq.section.id)) continue;
    if (filter?.questionIds && !filter.questionIds.has(nq.q.id)) continue;
    countOutcome(t, nq.q, visitOutcome(ctx, visit, nq.q));
  }
  return finishTally(t);
}

/** Pooled compliance across many visits. */
export function poolTally(ctx: AnalysisContext, visits: Visit[], filter?: { sectionIds?: Set<ID>; questionIds?: Set<ID> }): Tally {
  const t = emptyTally();
  for (const v of visits) addTally(t, visitTally(ctx, v, filter));
  return finishTally(t);
}

export function sectionTally(ctx: AnalysisContext, sectionId: ID, visits: Visit[], questionIds?: Set<ID>): Tally {
  return poolTally(ctx, visits, { sectionIds: new Set([sectionId]), questionIds });
}

// ---------------------------------------------------------------------------
// Visit progress (data capture)

export interface Progress {
  answered: number;
  answerable: number;
  requiredAnswered: number;
  required: number;
  missingRequired: Question[];
}

export function visitProgress(version: QuestionnaireVersion | undefined, visit: Visit): Progress {
  const p: Progress = { answered: 0, answerable: 0, requiredAnswered: 0, required: 0, missingRequired: [] };
  if (!version) return p;
  for (const s of version.sections) {
    for (const q of s.questions) {
      if (!isAnswerable(q)) continue;
      p.answerable++;
      const e = visit.responses[q.id];
      const done = e !== undefined && e.value !== '' && e.value !== null && e.value !== undefined;
      if (done) p.answered++;
      if (q.required) {
        p.required++;
        if (done) p.requiredAnswered++;
        else p.missingRequired.push(q);
      }
    }
  }
  return p;
}

export const canComplete = (p: Progress) => p.missingRequired.length === 0;

// ---------------------------------------------------------------------------
// Ratings (unscored, reported separately)

export function ratingAverage(ctx: AnalysisContext, q: Question, visits: Visit[]): { avg: number | null; n: number } {
  let sum = 0;
  let n = 0;
  for (const v of visits) {
    if (!visitHasQuestion(ctx, v, q.id)) continue;
    const e = v.responses[q.id];
    if (e && typeof e.value === 'number') {
      sum += e.value;
      n++;
    }
  }
  return { avg: n ? sum / n : null, n };
}

// ---------------------------------------------------------------------------
// Formatting helpers shared by UI and exports

export function fmtPct(p: number | null | undefined, digits = 0): string {
  if (p === null || p === undefined || Number.isNaN(p)) return '-';
  return `${p.toFixed(digits)}%`;
}

/** Performance band used for colouring percentages everywhere. */
export type Band = 'good' | 'fair' | 'poor' | 'none';
export function band(p: number | null | undefined, thresholds = { good: 80, fair: 60 }): Band {
  if (p === null || p === undefined) return 'none';
  if (p >= thresholds.good) return 'good';
  if (p >= thresholds.fair) return 'fair';
  return 'poor';
}
