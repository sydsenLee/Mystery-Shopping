import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, toast } from './ui';
import { useData } from '../store/store';
import { allTemplates, createExercise } from '../store/actions';
import { selectExercise } from '../store/ui';

export function NewExerciseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const navigate = useNavigate();
  const templates = useMemo(() => allTemplates(), [data.templates]);
  const [form, setForm] = useState({ oemName: '', name: '', periodStart: '', periodEnd: '', region: '', notes: '', source: templates[0]?.id ?? '' });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.oemName.trim() && form.name.trim();

  const submit = () => {
    setTried(true);
    if (!valid) return;
    if (form.periodStart && form.periodEnd && form.periodEnd < form.periodStart) {
      toast('The end date is before the start date.', 'err');
      return;
    }
    const ex = createExercise(form);
    selectExercise(ex.id);
    toast('Exercise created. Check the questionnaire, then add dealerships.');
    onClose();
    setForm({ oemName: '', name: '', periodStart: '', periodEnd: '', region: '', notes: '', source: templates[0]?.id ?? '' });
    setTried(false);
    navigate(`/exercises/${ex.id}/questionnaire`);
  };

  const pastExercises = [...data.exercises].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New mystery shopping exercise"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            Create exercise
          </button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <label className="field-label" htmlFor="nx-oem">
            OEM / brand *
          </label>
          <input id="nx-oem" className="input" list="nx-oem-list" value={form.oemName} onChange={set('oemName')} placeholder="e.g. Suzuki" autoFocus />
          <datalist id="nx-oem-list">
            {data.oems.map((o) => (
              <option key={o.id} value={o.name} />
            ))}
          </datalist>
          {tried && !form.oemName.trim() && <p className="mt-1 text-xs text-no">Enter the OEM or brand.</p>}
        </div>
        <div>
          <label className="field-label" htmlFor="nx-region">
            Region
          </label>
          <input id="nx-region" className="input" value={form.region} onChange={set('region')} placeholder="e.g. Gauteng" />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="nx-name">
            Exercise name *
          </label>
          <input id="nx-name" className="input" value={form.name} onChange={set('name')} placeholder="e.g. Gauteng Mystery Shopping, October 2026" />
          {tried && !form.name.trim() && <p className="mt-1 text-xs text-no">Give the exercise a name.</p>}
        </div>
        <div>
          <label className="field-label" htmlFor="nx-start">
            Assessment period from
          </label>
          <input id="nx-start" type="date" className="input" value={form.periodStart} onChange={set('periodStart')} />
        </div>
        <div>
          <label className="field-label" htmlFor="nx-end">
            to
          </label>
          <input id="nx-end" type="date" className="input" value={form.periodEnd} onChange={set('periodEnd')} />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="nx-source">
            Start the questionnaire from
          </label>
          <select id="nx-source" className="input" value={form.source} onChange={set('source')}>
            <optgroup label="Templates">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            {pastExercises.length > 0 && (
              <optgroup label="Copy from a previous exercise">
                {pastExercises.map((e) => (
                  <option key={e.id} value={`exercise:${e.id}`}>
                    {(data.oems.find((o) => o.id === e.oemId)?.name ?? '') + ' | ' + e.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <p className="mt-1 text-xs text-muted">You get your own copy. Edit it freely in the questionnaire builder.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="nx-notes">
            Notes
          </label>
          <textarea id="nx-notes" className="input min-h-[70px]" value={form.notes} onChange={set('notes')} placeholder="Optional briefing notes, scope or contacts" />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
