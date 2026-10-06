import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, FolderKanban, Plus, Sparkles } from 'lucide-react';
import { useData } from '../store/store';
import { selectExercise, useUi, setUi, rememberCaptureVisit } from '../store/ui';
import { exerciseSummary, periodLabel } from '../lib/report';
import { buildContext, poolTally, visitProgress } from '../lib/calc';
import { EmptyState, OemMark, PageHeader, PctBadge, ProgressBar, Stat, useBand } from '../components/ui';
import { NewExerciseModal } from '../components/NewExercise';
import { loadSampleData } from '../store/actions';
import { fmtPct } from '../lib/calc';

export default function Dashboard() {
  const data = useData();
  const navigate = useNavigate();
  const oemFilter = useUi((s) => s.oemFilter);
  const [newOpen, setNewOpen] = useState(false);
  const bandOf = useBand();

  const rows = useMemo(
    () =>
      data.exercises
        .filter((e) => !oemFilter || e.oemId === oemFilter)
        .map((e) => ({ e, oem: data.oems.find((o) => o.id === e.oemId), s: exerciseSummary(data, e.id) }))
        .sort((a, b) => (b.e.periodStart ?? b.e.createdAt).localeCompare(a.e.periodStart ?? a.e.createdAt)),
    [data, oemFilter],
  );

  const totals = useMemo(() => {
    // Pooled across exercises: every completed answer counts once.
    let compliant = 0;
    let valid = 0;
    for (const { e } of rows) {
      const versions = data.versions.filter((v) => v.exerciseId === e.id);
      const visits = data.visits.filter((v) => v.exerciseId === e.id && v.status === 'complete');
      const t = poolTally(buildContext(versions, visits), visits);
      compliant += t.compliant;
      valid += t.valid;
    }
    return {
      visits: rows.reduce((a, r) => a + r.s.visits, 0),
      completed: rows.reduce((a, r) => a + r.s.completed, 0),
      pct: valid ? (compliant / valid) * 100 : null,
    };
  }, [rows, data]);

  const inProgress = useMemo(() => {
    const ids = new Set(rows.map((r) => r.e.id));
    return data.visits
      .filter((v) => v.status === 'in_progress' && ids.has(v.exerciseId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6)
      .map((v) => ({
        v,
        dealer: data.dealerships.find((d) => d.id === v.dealershipId),
        ex: data.exercises.find((e) => e.id === v.exerciseId),
        p: visitProgress(
          data.versions.find((x) => x.id === v.questionnaireVersionId),
          v,
        ),
      }));
  }, [rows, data]);

  if (data.exercises.length === 0) {
    return (
      <>
        <PageHeader title="Welcome" subtitle="Replace the spreadsheet Blood Chart with fast Yes/No capture and automatic results." />
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <EmptyState
            icon={<FolderKanban size={36} />}
            title="Create your first exercise"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn-primary" onClick={() => setNewOpen(true)}>
                  <Plus size={16} /> New exercise
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const ex = loadSampleData();
                    selectExercise(ex.id);
                    navigate('/blood-chart');
                  }}
                >
                  <Sparkles size={16} /> Load sample data
                </button>
              </div>
            }
          >
            An exercise is one mystery shopping project for one OEM, for example "Suzuki, Gauteng Mystery Shopping, October 2026". The sample data lets you try every screen and can be deleted in Settings.
          </EmptyState>
          <div className="card p-5">
            <h3 className="font-display text-lg font-semibold">How it works</h3>
            <ol className="mt-3 space-y-3 text-sm">
              {[
                ['Create an exercise', 'Choose the OEM, name, period and region.'],
                ['Set up the questionnaire', 'Start from the Blood Chart template or build your own sections.'],
                ['Add dealership visits', 'Pick from the saved list so spelling stays consistent.'],
                ['Tap Yes or No', 'Every answer saves immediately. Move to the next dealership in one click.'],
                ['Read the results', 'Blood Chart, analytics and reports update by themselves.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
                  <span>
                    <span className="font-semibold">{t}.</span> <span className="text-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <NewExerciseModal open={newOpen} onClose={() => setNewOpen(false)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="All mystery shopping exercises at a glance."
        actions={
          <button className="btn-primary" onClick={() => setNewOpen(true)}>
            <Plus size={16} /> New exercise
          </button>
        }
      />

      {data.oems.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by OEM">
          <button className={`rounded-full border px-3 py-1 text-sm font-medium ${!oemFilter ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted hover:text-ink'}`} onClick={() => setUi({ oemFilter: null })}>
            All OEMs
          </button>
          {data.oems.map((o) => (
            <button key={o.id} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${oemFilter === o.id ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted hover:text-ink'}`} onClick={() => setUi({ oemFilter: o.id })}>
              {o.name}
            </button>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Exercises" value={rows.length} sub={`${new Set(rows.map((r) => r.e.oemId)).size} OEM${new Set(rows.map((r) => r.e.oemId)).size === 1 ? '' : 's'}`} />
        <Stat label="Visits assessed" value={totals.completed} sub={`${totals.visits - totals.completed} still in progress`} />
        <Stat label="Overall compliance" value={fmtPct(totals.pct)} tone={bandOf(totals.pct)} sub="Completed visits, all exercises" />
        <Stat label="Dealerships on file" value={data.dealerships.filter((d) => !d.archived).length} sub="Saved dealership list" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <section className="card min-w-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-display text-lg font-semibold">Mystery shopping exercises</h2>
            <Link to="/exercises" className="text-sm font-medium text-accent hover:underline">
              Manage
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="label-caps px-5 py-2.5">OEM</th>
                  <th className="label-caps px-3 py-2.5">Exercise</th>
                  <th className="label-caps px-3 py-2.5">Period</th>
                  <th className="label-caps px-3 py-2.5 text-right">Visits</th>
                  <th className="label-caps px-3 py-2.5">Sections</th>
                  <th className="label-caps px-5 py-2.5 text-right">Overall</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, oem, s }) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer border-b border-line/70 last:border-0 hover:bg-surface2/60"
                    onClick={() => {
                      selectExercise(e.id);
                      navigate(`/exercises/${e.id}`);
                    }}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <OemMark name={oem?.name} logo={oem?.logo} color={oem?.color} size={26} />
                        <span className="font-semibold">{oem?.name}</span>
                      </div>
                    </td>
                    <td className="min-w-[220px] px-3 py-3">
                      <div className="font-medium">{e.name}</div>
                      {e.region && <div className="text-xs text-muted">{e.region}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{periodLabel(e)}</td>
                    <td className="num px-3 py-3 text-right">
                      <span className="font-semibold">{s.completed}</span>
                      {s.visits > s.completed && <span className="text-muted"> / {s.visits}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        {s.sections.slice(0, 3).map((sec) => (
                          <div key={sec.section.id} className="flex items-center gap-2 text-xs">
                            <span className="w-28 truncate text-muted" title={sec.section.title}>
                              {sec.section.title}
                            </span>
                            <span className="num w-9 text-right font-medium">{fmtPct(sec.tally.pct)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <PctBadge pct={s.pct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card h-fit">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-display text-lg font-semibold">Continue capturing</h2>
            <ClipboardCheck size={18} className="text-muted" />
          </div>
          {inProgress.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No visits in progress. Start one from Data Capture.</p>
          ) : (
            <ul>
              {inProgress.map(({ v, dealer, ex, p }) => (
                <li key={v.id} className="border-b border-line/70 last:border-0">
                  <button
                    className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface2/60"
                    onClick={() => {
                      selectExercise(v.exerciseId);
                      rememberCaptureVisit(v.exerciseId, v.id);
                      navigate('/capture');
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{dealer?.name}</div>
                      <div className="truncate text-xs text-muted">{ex?.name}</div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <ProgressBar value={p.answered} max={p.answerable} />
                        <span className="num shrink-0 text-xs text-muted">
                          {p.answered}/{p.answerable}
                        </span>
                      </div>
                    </div>
                    <ArrowRight size={16} className="shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <NewExerciseModal open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}
