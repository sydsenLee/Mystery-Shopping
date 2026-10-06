import { useState, type ReactNode } from 'react';
import { FileSpreadsheet, FileText, FileDown, Table2, Loader2 } from 'lucide-react';
import { useReport } from '../store/hooks';
import { useUi } from '../store/ui';
import { FilterBar } from '../components/FilterBar';
import { ExercisePicker } from '../components/ExercisePicker';
import { OemMark, PageHeader, PctBadge, toast } from '../components/ui';
import { periodLabel, type ExerciseReport } from '../lib/report';
import { fmtPct } from '../lib/calc';
import type { CsvKind } from '../lib/exports';

export default function Reports() {
  const report = useReport();
  const exerciseId = useUi((s) => s.exerciseId);
  const [busy, setBusy] = useState<string | null>(null);
  const [withChart, setWithChart] = useState(true);

  if (!exerciseId || !report)
    return (
      <>
        <PageHeader title="Reports" subtitle="Choose an exercise to export." />
        <ExercisePicker />
      </>
    );

  const run = async (key: string, fn: (m: typeof import('../lib/exports'), r: ExerciseReport) => Promise<'saved' | 'declined' | 'failed'>) => {
    setBusy(key);
    try {
      const m = await import('../lib/exports');
      const res = await fn(m, report);
      if (res === 'failed') toast('The file could not be saved. Try again.', 'err');
    } catch (e) {
      console.error(e);
      toast('Something went wrong while building the file.', 'err');
    } finally {
      setBusy(null);
    }
  };

  const noData = report.visits.length === 0;

  return (
    <>
      <PageHeader eyebrow={report.oem?.name} title="Reports and export" subtitle="Exports use the filters below and the same calculations as the dashboards." />
      <FilterBar excludedInProgress={report.excludedInProgress} />
      {noData && <div className="card mb-5 border-warn/40 bg-warn-soft/50 px-4 py-3 text-sm text-warn">No visits match these filters, so exports will contain headings only.</div>}

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <ExportCard icon={<FileText size={20} />} title="PDF report" text="Branded report for the OEM: headline results, sections, strengths, improvement areas, dealership ranking and question compliance.">
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={withChart} onChange={(e) => setWithChart(e.target.checked)} /> Include the full Blood Chart (landscape pages)
            </label>
            <Btn busy={busy === 'pdf'} onClick={() => run('pdf', (m, r) => m.exportPdf(r, { includeBloodChart: withChart }))} primary>
              Download PDF
            </Btn>
          </ExportCard>
          <ExportCard icon={<FileSpreadsheet size={20} />} title="Excel workbook" text="Summary, colour-coded Blood Chart, question compliance, dealership results and every individual answer, each on its own sheet.">
            <div className="flex flex-wrap gap-2">
              <Btn busy={busy === 'xlsx'} onClick={() => run('xlsx', (m, r) => m.exportExcel(r))} primary>
                Download full workbook
              </Btn>
              <Btn busy={busy === 'xlsx-bc'} onClick={() => run('xlsx-bc', (m, r) => m.exportExcel(r, { bloodChartOnly: true }))}>
                <Table2 size={15} /> Blood Chart only
              </Btn>
            </div>
          </ExportCard>
          <ExportCard icon={<FileDown size={20} />} title="CSV files" text="Plain data for other tools such as Power BI or Google Sheets.">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['blood-chart', 'Blood Chart matrix'],
                  ['questions', 'Question compliance'],
                  ['dealers', 'Dealership results'],
                  ['responses', 'All responses'],
                ] as [CsvKind, string][]
              ).map(([k, label]) => (
                <Btn key={k} busy={busy === 'csv-' + k} onClick={() => run('csv-' + k, (m, r) => m.exportCsv(r, k))}>
                  {label}
                </Btn>
              ))}
            </div>
          </ExportCard>
        </div>

        <Preview r={report} />
      </div>
    </>
  );
}

function ExportCard({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-1 flex items-center gap-2.5">
        <span className="text-accent">{icon}</span>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      <p className="mb-4 text-sm text-muted">{text}</p>
      {children}
    </section>
  );
}

function Btn({ busy, onClick, children, primary }: { busy: boolean; onClick: () => void; children: ReactNode; primary?: boolean }) {
  return (
    <button className={primary ? 'btn-primary' : 'btn-secondary'} onClick={onClick} disabled={busy}>
      {busy && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

function Preview({ r }: { r: ExerciseReport }) {
  return (
    <section className="card overflow-hidden">
      <div className="h-1.5" style={{ background: r.oem?.color || 'rgb(var(--accent))' }} />
      <div className="p-6">
        <div className="label-caps mb-3">Report preview</div>
        <div className="flex items-start gap-4">
          <OemMark name={r.oem?.name} logo={r.oem?.logo} color={r.oem?.color} size={44} />
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold leading-tight">
              {r.oem?.name}: {r.exercise.name}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {periodLabel(r.exercise)}
              {r.exercise.region ? ` · ${r.exercise.region}` : ''} · {r.visits.length} dealership visit{r.visits.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Visits" value={String(r.visits.length)} />
          <Mini label="Overall" value={<PctBadge pct={r.overall.pct} size="lg" />} />
          {r.sections.slice(0, 2).map((s) => (
            <Mini key={s.section.id} label={s.section.title} value={<PctBadge pct={s.tally.pct} size="lg" />} />
          ))}
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <QList title="Key strengths" items={r.strengths.map((q) => [q.nq.code, q.nq.q.text, q.tally.pct])} />
          <QList title="Key areas requiring improvement" items={r.gaps.map((q) => [q.nq.code, q.nq.q.text, q.tally.pct])} />
        </div>
        <div className="mt-6">
          <div className="label-caps mb-2">Dealership results</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <tbody>
                {[...r.visitRows]
                  .sort((a, b) => (b.tally.pct ?? -1) - (a.tally.pct ?? -1))
                  .slice(0, 10)
                  .map((v, i) => (
                    <tr key={v.visit.id} className="border-b border-line/60 last:border-0">
                      <td className="num w-8 py-1.5 text-xs text-muted">{i + 1}</td>
                      <td className="py-1.5">{v.label}</td>
                      {r.sections.map((s) => (
                        <td key={s.section.id} className="num py-1.5 text-right text-xs text-muted">
                          {fmtPct(v.sections.get(s.section.id)?.pct ?? null)}
                        </td>
                      ))}
                      <td className="py-1.5 pl-3 text-right">
                        <PctBadge pct={v.tally.pct} size="sm" />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {r.visitRows.length > 10 && <p className="mt-2 text-xs text-muted">and {r.visitRows.length - 10} more in the export.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-line px-3 py-2.5">
      <div className="label-caps truncate">{label}</div>
      <div className="num mt-1 font-display text-xl font-semibold">{value}</div>
    </div>
  );
}

function QList({ title, items }: { title: string; items: [string, string, number | null][] }) {
  return (
    <div>
      <div className="label-caps mb-2">{title}</div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">Appears once visits are completed.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map(([code, text, pct]) => (
            <li key={code} className="flex items-start gap-2 text-sm">
              <span className="num w-9 shrink-0 pt-0.5 text-xs font-semibold text-muted">{code}</span>
              <span className="min-w-0 flex-1">{text}</span>
              <PctBadge pct={pct} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
