import { useState } from 'react';
import { FolderKanban, Plus } from 'lucide-react';
import { useData } from '../store/store';
import { selectExercise } from '../store/ui';
import { exerciseSummary, periodLabel } from '../lib/report';
import { EmptyState, OemMark, PctBadge } from './ui';
import { NewExerciseModal } from './NewExercise';

/** Shown on screens that work on one exercise when none is chosen yet. */
export function ExercisePicker() {
  const data = useData();
  const [open, setOpen] = useState(false);
  const list = [...data.exercises].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (list.length === 0)
    return (
      <>
        <EmptyState icon={<FolderKanban size={36} />} title="No exercises yet" action={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New exercise</button>}>
          Create an exercise first. Its questionnaire and dealership visits live inside it.
        </EmptyState>
        <NewExerciseModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {list.map((e) => {
        const oem = data.oems.find((o) => o.id === e.oemId);
        const s = exerciseSummary(data, e.id);
        return (
          <button key={e.id} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface2/60" onClick={() => selectExercise(e.id)}>
            <OemMark name={oem?.name} logo={oem?.logo} color={oem?.color} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {oem?.name} <span className="text-muted">|</span> {e.name}
              </div>
              <div className="text-xs text-muted">
                {periodLabel(e)} · {s.visits} visits
              </div>
            </div>
            <PctBadge pct={s.pct} />
          </button>
        );
      })}
    </div>
  );
}
