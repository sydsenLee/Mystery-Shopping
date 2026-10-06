import { useMemo, useState } from 'react';
import { ThumbsUp, TriangleAlert, Trophy, XCircle } from 'lucide-react';
import { useReport } from '../store/hooks';
import { useUi } from '../store/ui';
import { FilterBar } from '../components/FilterBar';
import { ExercisePicker } from '../components/ExercisePicker';
import { AnswerMix, BarList, ScoreHistogram } from '../components/charts';
import { PageHeader, PctBadge, Stat, useBand } from '../components/ui';
import { fmtPct } from '../lib/calc';
import { periodLabel, type QuestionRow } from '../lib/report';

export default function Analytics() {
  const report = useReport();
  const exerciseId = useUi((s) => s.exerciseId);
  const bandOf = useBand();
  const [by, setBy] = useState<'visit' | 'dealer'>('visit');
  const [qSort, setQSort] = useState<'worst' | 'best' | 'order'>('worst');

  const questionItems = useMemo(() => {
    if (!report) return [];
    let qs = report.questions.filter((q) => q.scored && !q.nq.q.isGroup);
    if (qSort === 'worst') qs = [...qs].sort((a, b) => (a.tally.pct ?? 101) - (b.tally.pct ?? 101));
    if (qSort === 'best') qs = [...qs].sort((a, b) => (b.tally.pct ?? -1) - (a.tally.pct ?? -1));
    return qs;
  }, [report, qSort]);

  if (!exerciseId || !report)
    return (
      <>
        <PageHeader title="Analytics" subtitle="Choose an exercise to analyse." />
        <ExercisePicker />
      </>
    );

  const ranking =
    by === 'visit'
      ? [...report.visitRows].sort((a, b) => (b.tally.pct ?? -1) - (a.tally.pct ?? -1)).map((v) => ({ key: v.visit.id, label: v.label, pct: v.tally.pct, detail: `${v.tally.compliant} of ${v.tally.valid} valid answers met the standard` }))
      : report.dealerRows.map((d) => ({ key: d.dealershipId, label: `${d.name}${d.visits.length > 1 ? ` (${d.visits.length} visits)` : ''}`, pct: d.tally.pct, detail: `${d.tally.compliant} of ${d.tally.valid} valid answers` }));

  return (
    <>
      <PageHeader eyebrow={report.oem?.name} title="Analytics" subtitle={`${report.exercise.name} · ${periodLabel(report.exercise)}`} />
      <FilterBar excludedInProgress={report.excludedInProgress} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Visits assessed" value={report.visits.length} sub={`${report.dealerRows.length} dealership${report.dealerRows.length === 1 ? '' : 's'}`} />
        <Stat label="Overall compliance" value={fmtPct(report.overall.pct)} tone={bandOf(report.overall.pct)} sub={`${report.overall.compliant} of ${report.overall.valid} answers`} />
        {report.sections.slice(0, 2).map((s) => (
          <Stat key={s.section.id} label={s.section.title} value={fmtPct(s.tally.pct)} tone={bandOf(s.tally.pct)} sub={`${s.tally.valid} valid answers`} />
        ))}
        <Stat label="Highest scoring visit" value={fmtPct(report.best?.tally.pct)} tone={bandOf(report.best?.tally.pct)} sub={report.best?.label ?? 'No results yet'} />
        <Stat label="Lowest scoring visit" value={fmtPct(report.worst?.tally.pct)} tone={bandOf(report.worst?.tally.pct)} sub={report.worst?.label ?? 'Needs two or more visits'} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Panel title="What dealerships are doing well" icon={<ThumbsUp size={17} className="text-yes" />}>
          <BarList items={report.strengths.map((q) => qItem(q))} empty="Results appear once visits are completed." />
          {report.perfect.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="label-caps mb-2">100% compliance ({report.perfect.length})</div>
              <ul className="space-y-1 text-sm">
                {report.perfect.map((q) => (
                  <li key={q.nq.q.id} className="flex gap-2">
                    <span className="num w-10 shrink-0 text-xs font-semibold text-muted">{q.nq.code}</span>
                    {q.nq.q.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
        <Panel title="Biggest gaps across the network" icon={<TriangleAlert size={17} className="text-no" />}>
          <BarList items={report.gaps.map((q) => qItem(q))} empty="Results appear once visits are completed." />
          {report.mostMissed.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="label-caps mb-2 flex items-center gap-1.5">
                <XCircle size={13} /> Most "No" (non-compliant) answers
              </div>
              <ul className="space-y-1.5 text-sm">
                {report.mostMissed.map((q) => (
                  <li key={q.nq.q.id} className="flex items-center gap-2">
                    <span className="num w-10 shrink-0 text-xs font-semibold text-muted">{q.nq.code}</span>
                    <span className="min-w-0 flex-1">{q.nq.q.text}</span>
                    <span className="num shrink-0 rounded bg-no-soft px-1.5 py-0.5 text-xs font-semibold text-no">
                      {q.misses} of {q.tally.valid}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <Panel title="Average by section">
            <BarList items={report.sections.map((s) => ({ key: s.section.id, prefix: s.index + 1, label: s.section.title, pct: s.tally.pct, detail: `${s.tally.compliant} of ${s.tally.valid}` }))} />
          </Panel>
          <Panel title="Spread of visit scores">
            <ScoreHistogram scores={report.visitRows.map((v) => v.tally.pct).filter((p): p is number => p !== null)} />
          </Panel>
        </div>
        <Panel
          title="Dealership ranking"
          icon={<Trophy size={17} className="text-warn" />}
          action={
            <div className="flex rounded-md border border-line p-0.5 text-xs font-semibold">
              {(['visit', 'dealer'] as const).map((k) => (
                <button key={k} className={`rounded px-2.5 py-1 ${by === k ? 'bg-accent text-accent-ink' : 'text-muted'}`} onClick={() => setBy(k)}>
                  {k === 'visit' ? 'By visit' : 'By dealership'}
                </button>
              ))}
            </div>
          }
        >
          <div className="max-h-[520px] overflow-auto pr-1">
            <BarList items={ranking} />
          </div>
        </Panel>
      </div>

      <Panel
        title="Question compliance"
        action={
          <select className="input w-auto py-1 text-xs" value={qSort} onChange={(e) => setQSort(e.target.value as typeof qSort)} aria-label="Sort questions">
            <option value="worst">Lowest first</option>
            <option value="best">Highest first</option>
            <option value="order">Questionnaire order</option>
          </select>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label-caps py-2 pr-3">#</th>
                <th className="label-caps py-2 pr-3">Question</th>
                <th className="label-caps py-2 pr-3">Section</th>
                <th className="label-caps num py-2 pr-3 text-right">Yes</th>
                <th className="label-caps num py-2 pr-3 text-right">No</th>
                <th className="label-caps num py-2 pr-3 text-right">N/A</th>
                <th className="label-caps num py-2 pr-3 text-right">Blank</th>
                <th className="label-caps w-36 py-2 pr-3">Answer mix</th>
                <th className="label-caps py-2 text-right">Compliance</th>
              </tr>
            </thead>
            <tbody>
              {questionItems.map((q) => (
                <tr key={q.nq.q.id} className="border-b border-line/60 last:border-0">
                  <td className="num py-2 pr-3 text-xs font-semibold text-muted">{q.nq.code}</td>
                  <td className="py-2 pr-3">
                    {q.nq.q.text}
                    {q.nq.q.reverse && <span className="ml-1 text-xs text-warn">(No is compliant)</span>}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted">{q.nq.section.title}</td>
                  <td className="num py-2 pr-3 text-right">{q.tally.yes}</td>
                  <td className="num py-2 pr-3 text-right">{q.tally.no}</td>
                  <td className="num py-2 pr-3 text-right text-muted">{q.tally.na}</td>
                  <td className="num py-2 pr-3 text-right text-muted">{q.tally.unanswered}</td>
                  <td className="py-2 pr-3">
                    <AnswerMix {...q.tally} reverse={q.nq.q.reverse} />
                  </td>
                  <td className="py-2 text-right">
                    <PctBadge pct={q.tally.pct} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Compliance = answers that meet the standard ÷ (Yes + No). N/A and blank answers are left out of the calculation.</p>
      </Panel>

      <div className="mt-5">
        <Panel title="Dealership results by section">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="label-caps py-2 pr-3">Dealership</th>
                  <th className="label-caps py-2 pr-3">Team</th>
                  {report.sections.map((s) => (
                    <th key={s.section.id} className="label-caps py-2 pr-3 text-right">
                      {s.section.title}
                    </th>
                  ))}
                  <th className="label-caps py-2 text-right">Overall</th>
                </tr>
              </thead>
              <tbody>
                {[...report.visitRows]
                  .sort((a, b) => (b.tally.pct ?? -1) - (a.tally.pct ?? -1))
                  .map((v) => (
                    <tr key={v.visit.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2 pr-3 font-medium">{v.label}</td>
                      <td className="py-2 pr-3 text-muted">{v.visit.team}</td>
                      {report.sections.map((s) => (
                        <td key={s.section.id} className="py-2 pr-3 text-right">
                          <PctBadge pct={v.sections.get(s.section.id)?.pct ?? null} size="sm" />
                        </td>
                      ))}
                      <td className="py-2 text-right">
                        <PctBadge pct={v.tally.pct} size="sm" />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}

function qItem(q: QuestionRow) {
  return { key: q.nq.q.id, prefix: q.nq.code, label: q.nq.q.text, pct: q.tally.pct, detail: `${q.tally.compliant} of ${q.tally.valid} valid answers` };
}

function Panel({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card min-w-0 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
