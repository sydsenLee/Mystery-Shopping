import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { visitOutcome, fmtPct, compliantValue, type Outcome } from '../lib/calc';
import type { ExerciseReport, QuestionRow, VisitRow } from '../lib/report';
import { rememberCaptureVisit } from '../store/ui';
import { useBand, bandTextClass } from './ui';

type ColOrder = 'visit' | 'score';
type RowOrder = 'questionnaire' | 'worst';

export function cellStyle(q: QuestionRow['nq']['q'], o: Outcome): { cls: string; text: string; title: string } {
  switch (o) {
    case 'yes':
    case 'no': {
      const ok = compliantValue(q) === o;
      return { cls: ok ? 'bg-yes text-on-status' : 'bg-no text-on-status', text: o === 'yes' ? 'Y' : 'N', title: `${o === 'yes' ? 'Yes' : 'No'}${q.reverse ? (ok ? ' (compliant)' : ' (not compliant)') : ''}` };
    }
    case 'na':
      return { cls: 'bg-na-soft text-na', text: 'N/A', title: 'Not applicable (excluded)' };
    case 'unanswered':
      return { cls: 'hatch text-muted', text: '', title: 'Not answered yet (excluded)' };
    case 'not_applicable_version':
      return { cls: 'bg-surface2 text-muted/60', text: '–', title: 'Not in the questionnaire version used for this visit' };
    default:
      return { cls: '', text: '', title: '' };
  }
}

export function BloodChart({ report }: { report: ExerciseReport }) {
  const navigate = useNavigate();
  const bandOf = useBand();
  const [colOrder, setColOrder] = useState<ColOrder>('visit');
  const [rowOrder, setRowOrder] = useState<RowOrder>('questionnaire');
  const [showLetters, setShowLetters] = useState(true);

  const cols: VisitRow[] = useMemo(() => (colOrder === 'score' ? [...report.visitRows].sort((a, b) => (b.tally.pct ?? -1) - (a.tally.pct ?? -1)) : report.visitRows), [report.visitRows, colOrder]);

  const groups = useMemo(() => {
    return report.sections.map((s) => {
      let rows = report.questions.filter((q) => q.nq.section.id === s.section.id);
      if (rowOrder === 'worst') rows = rows.filter((r) => !r.nq.q.isGroup && r.scored).sort((a, b) => (a.tally.pct ?? 101) - (b.tally.pct ?? 101));
      return { s, rows };
    });
  }, [report, rowOrder]);

  if (cols.length === 0)
    return <div className="card px-6 py-12 text-center text-sm text-muted">No visits match the current filters. {report.excludedInProgress > 0 && 'Tick "Include visits still in progress" to see visits that are not complete yet.'}</div>;

  const openVisit = (v: VisitRow) => {
    rememberCaptureVisit(v.visit.exerciseId, v.visit.id);
    navigate('/capture');
  };

  const pctCell = (p: number | null) => <span className={`num font-semibold ${bandTextClass(bandOf(p))}`}>{fmtPct(p)}</span>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted">Dealers</span>
          <select className="input w-auto py-1" value={colOrder} onChange={(e) => setColOrder(e.target.value as ColOrder)} aria-label="Dealer order">
            <option value="visit">In visit order</option>
            <option value="score">Best score first</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted">Questions</span>
          <select className="input w-auto py-1" value={rowOrder} onChange={(e) => setRowOrder(e.target.value as RowOrder)} aria-label="Question order">
            <option value="questionnaire">Questionnaire order</option>
            <option value="worst">Lowest compliance first</option>
          </select>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showLetters} onChange={(e) => setShowLetters(e.target.checked)} /> Show Y / N letters
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted">
          <Legend cls="bg-yes" label="Meets standard" />
          <Legend cls="bg-no" label="Does not" />
          <Legend cls="bg-na-soft border border-na/40" label="N/A" />
          <Legend cls="hatch border border-line" label="Not answered" />
          <Legend cls="bg-surface2 border border-line" label="Not in version" />
        </div>
      </div>

      <div className="card relative max-h-[75vh] overflow-auto">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[300px] max-w-[300px] border-b border-r border-line bg-surface px-3 py-2 text-left align-bottom sm:min-w-[380px] sm:max-w-[380px]">
                <div className="label-caps">Question</div>
                <div className="mt-0.5 text-xs font-normal text-muted">Click a dealer to open the visit</div>
              </th>
              {cols.map((c, i) => (
                <th key={c.visit.id} className="sticky top-0 z-20 h-40 w-11 min-w-[44px] border-b border-r border-line/60 bg-surface p-0 align-bottom">
                  <button className="flex h-40 w-full flex-col items-center justify-end gap-1 px-1 pb-2 hover:bg-surface2" onClick={() => openVisit(c)} title={`${c.label}${c.visit.team ? ' · ' + c.visit.team : ''}${c.visit.status !== 'complete' ? ' (in progress)' : ''}`}>
                    <span className="max-h-[120px] overflow-hidden whitespace-nowrap text-xs font-semibold" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                      {c.label}
                    </span>
                    <span className={`num text-[10px] ${c.visit.status !== 'complete' ? 'text-warn' : 'text-muted'}`}>{colOrder === 'visit' ? i + 1 : '#' + (i + 1)}</span>
                  </button>
                </th>
              ))}
              <th className="sticky right-0 top-0 z-30 min-w-[120px] border-b border-l border-line bg-surface px-3 py-2 text-right align-bottom">
                <div className="label-caps">Compliance</div>
                <div className="mt-0.5 text-[11px] font-normal text-muted">Yes ÷ (Yes + No)</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ s, rows }) => (
              <Fragment key={s.section.id}>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-r border-line bg-surface2 px-3 py-2 text-left font-display text-[15px] font-semibold">
                    {s.index + 1}. {s.section.title}
                  </th>
                  {cols.map((c) => (
                    <td key={c.visit.id} className="border-b border-r border-line/60 bg-surface2 px-0 py-2 text-center text-[11px]">
                      {pctCell(c.sections.get(s.section.id)?.pct ?? null)}
                    </td>
                  ))}
                  <td className="sticky right-0 z-10 border-b border-l border-line bg-surface2 px-3 py-2 text-right">{pctCell(s.tally.pct)}</td>
                </tr>
                {rows.map((r) => (
                  <tr key={r.nq.q.id} className="group">
                    <th className={`sticky left-0 z-10 border-b border-r border-line/60 bg-surface px-3 py-1.5 text-left font-normal group-hover:bg-surface2 ${r.nq.depth ? 'pl-8' : ''}`}>
                      <div className="flex gap-2">
                        <span className="num w-7 shrink-0 text-xs font-semibold text-muted">{r.nq.label}</span>
                        <span className={`min-w-0 leading-snug ${r.nq.q.isGroup ? 'font-semibold' : ''}`}>
                          {r.nq.q.text}
                          {r.nq.q.reverse && <span className="ml-1 text-[11px] text-warn">(negative behaviour)</span>}
                          {r.nq.retired && <span className="ml-1 text-[11px] text-muted">(earlier version only)</span>}
                        </span>
                      </div>
                    </th>
                    {cols.map((c) => {
                      if (r.nq.q.isGroup) return <td key={c.visit.id} className="border-b border-r border-line/60" />;
                      if (!r.scored) {
                        const e = c.visit.responses[r.nq.q.id];
                        return (
                          <td key={c.visit.id} className="border-b border-r border-line/60 px-1 text-center text-[11px] text-muted" title={e ? String(e.value) : 'Not answered'}>
                            {e ? (typeof e.value === 'number' ? e.value : '✓') : ''}
                          </td>
                        );
                      }
                      const o = visitOutcome(report.ctx, c.visit, r.nq.q);
                      const st = cellStyle(r.nq.q, o);
                      const note = c.visit.responses[r.nq.q.id]?.comment;
                      return (
                        <td key={c.visit.id} className="border-b border-r border-surface p-[2px]">
                          <div className={`relative flex h-7 items-center justify-center rounded-[3px] text-[11px] font-bold ${st.cls}`} title={`${c.label}: ${st.title}${note ? '\nNote: ' + note : ''}`}>
                            {showLetters ? st.text : ''}
                            {note && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-white/80" />}
                          </div>
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 border-b border-l border-line bg-surface px-3 py-1.5 text-right group-hover:bg-surface2">
                      {r.scored ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="num text-[11px] text-muted" title={`${r.tally.compliant} of ${r.tally.valid} valid answers`}>
                            {r.tally.compliant}/{r.tally.valid}
                          </span>
                          {pctCell(r.tally.pct)}
                        </div>
                      ) : r.rating?.avg != null ? (
                        <span className="num text-xs text-muted">avg {r.rating.avg.toFixed(1)}/5</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr>
              <th className="sticky bottom-0 left-0 z-30 border-r border-t-2 border-line bg-surface px-3 py-2.5 text-left font-display text-[15px] font-semibold">Overall score per visit</th>
              {cols.map((c) => (
                <td key={c.visit.id} className="sticky bottom-0 z-20 border-r border-t-2 border-line bg-surface px-0 py-2.5 text-center text-[11px]">
                  {pctCell(c.tally.pct)}
                </td>
              ))}
              <td className="sticky bottom-0 right-0 z-30 border-l border-t-2 border-line bg-surface px-3 py-2.5 text-right">
                <span className={`num font-display text-lg font-bold ${bandTextClass(bandOf(report.overall.pct))}`}>{fmtPct(report.overall.pct)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3.5 w-3.5 rounded-[3px] ${cls}`} />
      {label}
    </span>
  );
}
