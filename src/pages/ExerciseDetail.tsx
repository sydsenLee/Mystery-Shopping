import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, FileDown, Table2, Trash2, BarChart3 } from 'lucide-react';
import { useData } from '../store/store';
import { selectExercise } from '../store/ui';
import { buildReport, periodLabel } from '../lib/report';
import { fmtPct } from '../lib/calc';
import { ConfirmButton, EmptyState, OemMark, PageHeader, PctBadge, Stat, toast, useBand } from '../components/ui';
import { QuestionnaireBuilder } from '../components/QuestionnaireBuilder';
import { VisitsManager } from '../components/VisitsManager';
import { deleteExercise, updateExercise } from '../store/actions';
import { STATUS_CLASS, STATUS_LABEL } from './Exercises';
import type { Exercise, ExerciseStatus } from '../lib/types';

const TABS = [
  { key: '', label: 'Overview' },
  { key: 'questionnaire', label: 'Questionnaire' },
  { key: 'visits', label: 'Dealership visits' },
  { key: 'details', label: 'Details' },
];

export default function ExerciseDetail() {
  const { id = '', tab = '' } = useParams();
  const data = useData();
  const exercise = data.exercises.find((e) => e.id === id);
  const oem = data.oems.find((o) => o.id === exercise?.oemId);

  useEffect(() => {
    if (exercise) selectExercise(exercise.id);
  }, [exercise?.id]);

  if (!exercise)
    return (
      <EmptyState title="Exercise not found" action={<Link className="btn-primary" to="/exercises">Back to exercises</Link>}>
        It may have been deleted.
      </EmptyState>
    );

  return (
    <>
      <Link to="/exercises" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> All exercises
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <OemMark name={oem?.name} logo={oem?.logo} color={oem?.color} size={18} /> {oem?.name}
          </span>
        }
        title={exercise.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[exercise.status]}`}>{STATUS_LABEL[exercise.status]}</span>
            {periodLabel(exercise)}
            {exercise.region && <span>· {exercise.region}</span>}
          </span>
        }
        actions={
          <>
            <Link className="btn-secondary" to="/blood-chart">
              <Table2 size={16} /> Blood Chart
            </Link>
            <Link className="btn-primary" to="/capture">
              <ClipboardCheck size={16} /> Capture visits
            </Link>
          </>
        }
      />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <NavLink
            key={t.key}
            to={`/exercises/${id}${t.key ? '/' + t.key : ''}`}
            end
            role="tab"
            className={({ isActive }) => `-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${isActive ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      {tab === '' && <Overview exercise={exercise} />}
      {tab === 'questionnaire' && <QuestionnaireBuilder exerciseId={exercise.id} />}
      {tab === 'visits' && <VisitsManager exerciseId={exercise.id} />}
      {tab === 'details' && <Details exercise={exercise} />}
    </>
  );
}

function Overview({ exercise }: { exercise: Exercise }) {
  const data = useData();
  const bandOf = useBand();
  const r = useMemo(() => buildReport(data, { exerciseId: exercise.id, includeInProgress: false }), [data, exercise.id]);
  const total = data.visits.filter((v) => v.exerciseId === exercise.id).length;
  if (!r) return null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Visits complete" value={r.visits.length} sub={`${total - r.visits.length} in progress`} />
        <Stat label="Overall compliance" value={fmtPct(r.overall.pct)} tone={bandOf(r.overall.pct)} sub={`${r.overall.compliant} of ${r.overall.valid} answers met the standard`} />
        {r.sections.slice(0, 2).map((s) => (
          <Stat key={s.section.id} label={s.section.title} value={fmtPct(s.tally.pct)} tone={bandOf(s.tally.pct)} sub={`Section ${s.index + 1}`} />
        ))}
      </div>
      {r.sections.length > 2 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {r.sections.slice(2).map((s) => (
            <Stat key={s.section.id} label={s.section.title} value={fmtPct(s.tally.pct)} tone={bandOf(s.tally.pct)} sub={`Section ${s.index + 1}`} />
          ))}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-display text-lg font-semibold">Dealership results</h2>
            <Link to="/analytics" className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              <BarChart3 size={14} /> Analytics
            </Link>
          </div>
          {r.visitRows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No completed visits yet.</p>
          ) : (
            <ul className="max-h-[420px] overflow-auto">
              {[...r.visitRows]
                .sort((a, b) => (b.tally.pct ?? -1) - (a.tally.pct ?? -1))
                .map((v, i) => (
                  <li key={v.visit.id} className="flex items-center gap-3 border-b border-line/60 px-5 py-2.5 last:border-0">
                    <span className="num w-6 text-right text-xs text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.label}</span>
                    <span className="text-xs text-muted">{v.visit.team}</span>
                    <PctBadge pct={v.tally.pct} size="sm" />
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-display text-lg font-semibold">Biggest gaps</h2>
            <Link to="/reports" className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              <FileDown size={14} /> Report
            </Link>
          </div>
          {r.gaps.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Results appear once visits are completed.</p>
          ) : (
            <ul>
              {r.gaps.map((g) => (
                <li key={g.nq.q.id} className="flex items-center gap-3 border-b border-line/60 px-5 py-2.5 last:border-0">
                  <span className="num w-10 shrink-0 text-xs font-semibold text-muted">{g.nq.code}</span>
                  <span className="min-w-0 flex-1 text-sm">{g.nq.q.text}</span>
                  <PctBadge pct={g.tally.pct} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {exercise.notes && (
        <div className="card px-5 py-4 text-sm">
          <div className="label-caps mb-1">Notes</div>
          <p className="whitespace-pre-wrap">{exercise.notes}</p>
        </div>
      )}
    </div>
  );
}

function Details({ exercise }: { exercise: Exercise }) {
  const data = useData();
  const navigate = useNavigate();
  const [f, setF] = useState(exercise);
  useEffect(() => setF(exercise), [exercise]);
  const save = (patch: Partial<Exercise>) => {
    setF((x) => ({ ...x, ...patch }));
    updateExercise(exercise, patch);
  };
  const visits = data.visits.filter((v) => v.exerciseId === exercise.id).length;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="ed-name">
            Exercise name
          </label>
          <input id="ed-name" className="input" value={f.name} onChange={(e) => save({ name: e.target.value })} />
        </div>
        <div>
          <label className="field-label" htmlFor="ed-oem">
            OEM
          </label>
          <select id="ed-oem" className="input" value={f.oemId} onChange={(e) => save({ oemId: e.target.value })}>
            {data.oems.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="ed-status">
            Status
          </label>
          <select id="ed-status" className="input" value={f.status} onChange={(e) => save({ status: e.target.value as ExerciseStatus })}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="ed-start">
            Period from
          </label>
          <input id="ed-start" type="date" className="input" value={f.periodStart ?? ''} onChange={(e) => save({ periodStart: e.target.value || undefined })} />
        </div>
        <div>
          <label className="field-label" htmlFor="ed-end">
            to
          </label>
          <input id="ed-end" type="date" className="input" value={f.periodEnd ?? ''} onChange={(e) => save({ periodEnd: e.target.value || undefined })} />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="ed-region">
            Region
          </label>
          <input id="ed-region" className="input" value={f.region ?? ''} onChange={(e) => save({ region: e.target.value || undefined })} />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="ed-notes">
            Notes
          </label>
          <textarea id="ed-notes" className="input min-h-[100px]" value={f.notes ?? ''} onChange={(e) => save({ notes: e.target.value || undefined })} />
        </div>
        <p className="text-xs text-muted sm:col-span-2">Changes save automatically. OEM logos and brand colours are set in Settings.</p>
      </div>
      <div className="card h-fit border-no/30 p-5">
        <h3 className="font-display text-lg font-semibold">Delete exercise</h3>
        <p className="mt-1 text-sm text-muted">
          Removes the exercise, its questionnaire versions and all {visits} visit{visits === 1 ? '' : 's'}. Dealerships stay in the saved list. Export a backup first if you might need it.
        </p>
        <ConfirmButton
          className="btn-danger mt-4"
          confirmText="Click again to delete for good"
          onConfirm={() => {
            deleteExercise(exercise.id);
            selectExercise(null);
            toast('Exercise deleted.');
            navigate('/exercises');
          }}
        >
          <Trash2 size={16} /> Delete exercise
        </ConfirmButton>
      </div>
    </div>
  );
}
