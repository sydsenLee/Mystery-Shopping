import { describe, expect, it } from 'vitest';
import { buildContext, canComplete, mergeVersions, numberSections, poolTally, questionTally, visitProgress, visitTally } from './calc';
import { buildReport } from './report';
import type { Collections, Question, QuestionnaireVersion, ResponseValue, Visit } from './types';

const now = '2026-10-01T00:00:00.000Z';
const q = (id: string, extra: Partial<Question> = {}): Question => ({ id, text: id, type: 'yes_no', required: true, ...extra });

function version(id: string, n: number, questions: Question[][]): QuestionnaireVersion {
  return {
    id,
    exerciseId: 'ex',
    version: n,
    createdAt: now,
    sections: questions.map((qs, i) => ({ id: `s${i + 1}`, title: `Section ${i + 1}`, questions: qs })),
  };
}

function visit(id: string, answers: Record<string, ResponseValue>, ver = 'v1', status: Visit['status'] = 'complete'): Visit {
  const responses: Visit['responses'] = {};
  for (const [k, v] of Object.entries(answers)) responses[k] = { value: v, at: now };
  return { id, exerciseId: 'ex', dealershipId: 'd-' + id, questionnaireVersionId: ver, status, responses, createdAt: now, updatedAt: now };
}

describe('question compliance', () => {
  const v1 = version('v1', 1, [[q('clean')]]);

  it('100% when all valid answers are Yes', () => {
    const visits = Array.from({ length: 20 }, (_, i) => visit('x' + i, { clean: 'yes' }));
    const ctx = buildContext([v1], visits);
    expect(questionTally(ctx, v1.sections[0].questions[0], visits).pct).toBe(100);
  });

  it('75% for 15 Yes and 5 No', () => {
    const visits = Array.from({ length: 20 }, (_, i) => visit('x' + i, { clean: i < 15 ? 'yes' : 'no' }));
    const ctx = buildContext([v1], visits);
    expect(questionTally(ctx, v1.sections[0].questions[0], visits).pct).toBe(75);
  });

  it('40% for 8 Yes and 12 No', () => {
    const visits = Array.from({ length: 20 }, (_, i) => visit('x' + i, { clean: i < 8 ? 'yes' : 'no' }));
    const ctx = buildContext([v1], visits);
    expect(questionTally(ctx, v1.sections[0].questions[0], visits).pct).toBe(40);
  });

  it('excludes unanswered from the denominator (20 / 25 = 80%, not 20 / 30)', () => {
    const visits = Array.from({ length: 30 }, (_, i) => visit('x' + i, i < 20 ? { clean: 'yes' } : i < 25 ? { clean: 'no' } : {}));
    const ctx = buildContext([v1], visits);
    const t = questionTally(ctx, v1.sections[0].questions[0], visits);
    expect(t).toMatchObject({ yes: 20, no: 5, unanswered: 5, valid: 25 });
    expect(t.pct).toBe(80);
  });

  it('excludes N/A from the denominator', () => {
    const v = version('v1', 1, [[q('clean', { type: 'yes_no_na' })]]);
    const visits = [visit('a', { clean: 'yes' }), visit('b', { clean: 'na' }), visit('c', { clean: 'no' })];
    const ctx = buildContext([v], visits);
    const t = questionTally(ctx, v.sections[0].questions[0], visits);
    expect(t).toMatchObject({ yes: 1, no: 1, na: 1, valid: 2 });
    expect(t.pct).toBe(50);
  });

  it('returns null, not 0, when nothing has been answered', () => {
    const visits = [visit('a', {})];
    const ctx = buildContext([v1], visits);
    expect(questionTally(ctx, v1.sections[0].questions[0], visits).pct).toBeNull();
  });

  it('treats No as compliant on a reverse (negative behaviour) question', () => {
    const v = version('v1', 1, [[q('cihy', { reverse: true })]]);
    const visits = [visit('a', { cihy: 'no' }), visit('b', { cihy: 'no' }), visit('c', { cihy: 'yes' }), visit('d', { cihy: 'no' })];
    const ctx = buildContext([v], visits);
    expect(questionTally(ctx, v.sections[0].questions[0], visits).pct).toBe(75);
  });
});

describe('visit and section scores', () => {
  const qs1 = Array.from({ length: 10 }, (_, i) => q('a' + i));
  const qs2 = Array.from({ length: 15 }, (_, i) => q('b' + i));
  const v1 = version('v1', 1, [qs1, qs2]);

  it('23 Yes from 25 applicable = 92%', () => {
    const answers: Record<string, ResponseValue> = {};
    [...qs1, ...qs2].forEach((x, i) => (answers[x.id] = i < 23 ? 'yes' : 'no'));
    const vis = visit('m', answers);
    const ctx = buildContext([v1], [vis]);
    expect(visitTally(ctx, vis).pct).toBe(92);
    expect(visitTally(ctx, vis, { sectionIds: new Set(['s1']) }).pct).toBe(100);
    expect(visitTally(ctx, vis, { sectionIds: new Set(['s2']) }).pct).toBeCloseTo((13 / 15) * 100);
  });

  it('pools section results across visits by answers, not by averaging percentages', () => {
    const a = visit('a', { a0: 'yes' }); // 1/1
    const b = visit('b', { a0: 'no', a1: 'no', a2: 'no' }); // 0/3
    const ctx = buildContext([v1], [a, b]);
    expect(poolTally(ctx, [a, b], { sectionIds: new Set(['s1']) }).pct).toBe(25);
  });

  it('ignores group headings', () => {
    const v = version('v1', 1, [[q('g', { isGroup: true }), q('g1', { parentId: 'g' }), q('g2', { parentId: 'g' })]]);
    const vis = visit('a', { g1: 'yes', g2: 'no' });
    const ctx = buildContext([v], [vis]);
    expect(visitTally(ctx, vis)).toMatchObject({ valid: 2, compliant: 1, pct: 50 });
  });

  it('does not score rating, choice or text questions', () => {
    const v = version('v1', 1, [[q('y'), q('r', { type: 'rating5' }), q('t', { type: 'text' })]]);
    const vis = visit('a', { y: 'yes', r: 1, t: 'hello' });
    const ctx = buildContext([v], [vis]);
    expect(visitTally(ctx, vis)).toMatchObject({ valid: 1, pct: 100 });
  });
});

describe('numbering', () => {
  it('numbers questions per section with lettered sub-questions', () => {
    const v = version('v1', 1, [[q('p'), q('g', { isGroup: true }), q('g1', { parentId: 'g' }), q('g2', { parentId: 'g' }), q('x')], [q('y')]]);
    const labels = numberSections(v.sections).map((n) => n.code);
    expect(labels).toEqual(['1.1', '1.2', '1.2a', '1.2b', '1.3', '2.1']);
  });
});

describe('progress and completion', () => {
  it('blocks completion while required questions are unanswered', () => {
    const v = version('v1', 1, [[q('a'), q('b'), q('c', { required: false })]]);
    const p1 = visitProgress(v, visit('x', { a: 'yes' }));
    expect(p1).toMatchObject({ answered: 1, answerable: 3, required: 2, requiredAnswered: 1 });
    expect(canComplete(p1)).toBe(false);
    expect(canComplete(visitProgress(v, visit('x', { a: 'yes', b: 'na' })))).toBe(true);
  });
});

describe('questionnaire versions', () => {
  const v1 = version('v1', 1, [[q('a'), q('old')]]);
  const v2 = version('v2', 2, [[q('a', { text: 'A (new wording)' }), q('new')]]);

  it('keeps retired questions and uses latest wording', () => {
    const { sections, retired } = mergeVersions([v2, v1]);
    expect(sections[0].questions.map((x) => x.id)).toEqual(['a', 'new', 'old']);
    expect(sections[0].questions[0].text).toBe('A (new wording)');
    expect([...retired]).toEqual(['old']);
  });

  it('does not count a question as unanswered for visits on a version without it', () => {
    const old = visit('o', { a: 'yes', old: 'no' }, 'v1');
    const cur = visit('c', { a: 'no', new: 'yes' }, 'v2');
    const ctx = buildContext([v1, v2], [old, cur]);
    const newQ = ctx.sections[0].questions.find((x) => x.id === 'new')!;
    expect(questionTally(ctx, newQ, [old, cur])).toMatchObject({ yes: 1, unanswered: 0, valid: 1, pct: 100 });
    expect(visitTally(ctx, old).pct).toBe(50);
  });
});

describe('report', () => {
  it('excludes in-progress visits unless asked, and applies filters', () => {
    const v = version('v1', 1, [[q('a')]]);
    const data: Collections = {
      oems: [{ id: 'o', name: 'OEM', createdAt: now }],
      dealerships: [
        { id: 'd-1', name: 'One', region: 'North', createdAt: now },
        { id: 'd-2', name: 'Two', region: 'South', createdAt: now },
        { id: 'd-3', name: 'Three', region: 'South', createdAt: now },
      ],
      exercises: [{ id: 'ex', oemId: 'o', name: 'Ex', status: 'active', createdAt: now, updatedAt: now }],
      versions: [v],
      visits: [visit('1', { a: 'yes' }), visit('2', { a: 'no' }), visit('3', { a: 'yes' }, 'v1', 'in_progress')],
      templates: [],
    };
    const r1 = buildReport(data, { exerciseId: 'ex', includeInProgress: false })!;
    expect(r1.overall.pct).toBe(50);
    expect(r1.excludedInProgress).toBe(1);
    const r2 = buildReport(data, { exerciseId: 'ex', includeInProgress: true })!;
    expect(r2.overall.pct).toBeCloseTo(66.67, 1);
    const r3 = buildReport(data, { exerciseId: 'ex', includeInProgress: true, regions: ['South'] })!;
    expect(r3.visits.length).toBe(2);
    expect(r3.overall.pct).toBe(50);
    expect(r3.best?.label).toBe('Three');
  });
});
