import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus, Search } from 'lucide-react';
import { useData } from '../store/store';
import { selectExercise } from '../store/ui';
import { exerciseSummary, periodLabel } from '../lib/report';
import { EmptyState, OemMark, PageHeader, PctBadge } from '../components/ui';
import { NewExerciseModal } from '../components/NewExercise';
import type { ExerciseStatus } from '../lib/types';

export const STATUS_LABEL: Record<ExerciseStatus, string> = { planning: 'Planning', active: 'In field', closed: 'Closed' };
export const STATUS_CLASS: Record<ExerciseStatus, string> = {
  planning: 'bg-surface2 text-muted',
  active: 'bg-accent-soft text-accent',
  closed: 'bg-yes-soft text-yes',
};

export default function Exercises() {
  const data = useData();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [oem, setOem] = useState('');
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.exercises
      .filter((e) => (!oem || e.oemId === oem) && (!s || e.name.toLowerCase().includes(s) || e.region?.toLowerCase().includes(s)))
      .map((e) => ({ e, oem: data.oems.find((o) => o.id === e.oemId), s: exerciseSummary(data, e.id) }))
      .sort((a, b) => (b.e.periodStart ?? b.e.createdAt).localeCompare(a.e.periodStart ?? a.e.createdAt));
  }, [data, q, oem]);

  return (
    <>
      <PageHeader
        title="Exercises"
        subtitle="Every mystery shopping project, past and present. Open one to see its questionnaire, visits and results."
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> New exercise
          </button>
        }
      />
      {data.exercises.length === 0 ? (
        <EmptyState icon={<FolderKanban size={36} />} title="No exercises yet" action={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New exercise</button>}>
          Create an exercise for each OEM and assessment period.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative w-full max-w-xs">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" />
            </div>
            <select className="input w-auto" value={oem} onChange={(e) => setOem(e.target.value)} aria-label="Filter by OEM">
              <option value="">All OEMs</option>
              {data.oems.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ e, oem, s }) => (
              <button
                key={e.id}
                className="card flex flex-col p-5 text-left transition-shadow hover:shadow-md"
                onClick={() => {
                  selectExercise(e.id);
                  navigate(`/exercises/${e.id}`);
                }}
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <OemMark name={oem?.name} logo={oem?.logo} color={oem?.color} size={30} />
                    <div className="min-w-0">
                      <div className="label-caps">{oem?.name}</div>
                      <div className="truncate font-display text-lg font-semibold leading-tight">{e.name}</div>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                </div>
                <div className="mt-2 text-sm text-muted">
                  {periodLabel(e)}
                  {e.region ? ` · ${e.region}` : ''}
                </div>
                <div className="mt-4 flex w-full items-end justify-between border-t border-line pt-3">
                  <div className="num text-sm">
                    <span className="font-display text-2xl font-semibold">{s.completed}</span>
                    <span className="text-muted"> visits complete{s.visits > s.completed ? `, ${s.visits - s.completed} in progress` : ''}</span>
                  </div>
                  <PctBadge pct={s.pct} size="lg" />
                </div>
              </button>
            ))}
          </div>
          {rows.length === 0 && <p className="text-sm text-muted">No exercises match your search.</p>}
        </>
      )}
      <NewExerciseModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
