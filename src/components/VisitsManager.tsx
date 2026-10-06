import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ListPlus, Pencil, Trash2 } from 'lucide-react';
import { useData } from '../store/store';
import { createVisit, deleteVisit, findOrCreateDealership, latestVersion, normaliseName, updateVisit } from '../store/actions';
import { rememberCaptureVisit } from '../store/ui';
import { buildContext, visitProgress, visitTally } from '../lib/calc';
import { visitDisplayLabels } from '../lib/report';
import { ConfirmButton, DealershipPicker, Modal, PctBadge, ProgressBar, toast } from './ui';
import type { ID } from '../lib/types';

export function VisitsManager({ exerciseId }: { exerciseId: ID }) {
  const data = useData();
  const navigate = useNavigate();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState('');

  const visits = useMemo(() => data.visits.filter((v) => v.exerciseId === exerciseId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [data.visits, exerciseId]);
  const versions = useMemo(() => data.versions.filter((v) => v.exerciseId === exerciseId), [data.versions, exerciseId]);
  const ctx = useMemo(() => buildContext(versions, visits), [versions, visits]);
  const dealers = useMemo(() => new Map(data.dealerships.map((d) => [d.id, d])), [data.dealerships]);
  const labels = useMemo(() => visitDisplayLabels(visits, dealers), [visits, dealers]);
  const latest = latestVersion(exerciseId);

  const bulkNames = bulk
    .split(/\n|;/)
    .map(normaliseName)
    .filter(Boolean);

  const addBulk = () => {
    for (const n of bulkNames) createVisit(exerciseId, findOrCreateDealership(n).id);
    toast(`${bulkNames.length} visit${bulkNames.length === 1 ? '' : 's'} added.`);
    setBulk('');
    setBulkOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[240px] flex-1">
          <span className="field-label">Add a dealership visit</span>
          <DealershipPicker
            dealerships={data.dealerships}
            placeholder="Search saved dealerships or type a new name"
            onPick={(d) => {
              const dealer = typeof d === 'string' ? findOrCreateDealership(d) : d;
              createVisit(exerciseId, dealer.id);
              toast(`Visit added: ${dealer.name}`);
            }}
          />
        </div>
        <button className="btn-secondary" onClick={() => setBulkOpen(true)}>
          <ListPlus size={16} /> Add many at once
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface2/60 text-left">
                <th className="label-caps w-10 px-4 py-2.5">#</th>
                <th className="label-caps px-3 py-2.5">Dealership</th>
                <th className="label-caps px-3 py-2.5">Team / shopper</th>
                <th className="label-caps px-3 py-2.5">Visit date</th>
                <th className="label-caps px-3 py-2.5">Progress</th>
                <th className="label-caps px-3 py-2.5">Status</th>
                <th className="label-caps px-3 py-2.5 text-right">Score</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visits.map((v, i) => {
                const ver = versions.find((x) => x.id === v.questionnaireVersionId);
                const p = visitProgress(ver, v);
                const t = visitTally(ctx, v);
                return (
                  <tr key={v.id} className="border-b border-line/60 last:border-0">
                    <td className="num px-4 py-2 text-muted">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{labels.get(v.id)}</div>
                      {ver && latest && ver.id !== latest.id && <div className="text-xs text-warn">Questionnaire v{ver.version}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <input className="input w-32 py-1" value={v.team ?? ''} onChange={(e) => updateVisit(v.id, { team: e.target.value })} aria-label="Team" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="date" className="input w-36 py-1" value={v.visitDate ?? ''} onChange={(e) => updateVisit(v.id, { visitDate: e.target.value || undefined })} aria-label="Visit date" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex w-36 items-center gap-2">
                        <ProgressBar value={p.answered} max={p.answerable} tone={v.status === 'complete' ? 'yes' : 'accent'} />
                        <span className="num shrink-0 text-xs text-muted">
                          {p.answered}/{p.answerable}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {v.status === 'complete' ? <span className="rounded bg-yes-soft px-2 py-0.5 text-xs font-semibold text-yes">Complete</span> : <span className="rounded bg-surface2 px-2 py-0.5 text-xs font-semibold text-muted">In progress</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <PctBadge pct={t.pct} size="sm" />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          className="btn-secondary px-2.5 py-1 text-xs"
                          onClick={() => {
                            rememberCaptureVisit(exerciseId, v.id);
                            navigate('/capture');
                          }}
                        >
                          <Pencil size={13} /> Capture
                        </button>
                        <ConfirmButton className="btn-ghost px-2 py-1 text-no" confirmText="Delete?" title="Delete visit" onConfirm={() => deleteVisit(v.id)}>
                          <Trash2 size={14} />
                        </ConfirmButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visits.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    <ClipboardList className="mx-auto mb-2" size={28} />
                    No visits yet. Add the dealerships that were (or will be) visited.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Add many visits"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBulkOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={bulkNames.length === 0} onClick={addBulk}>
              Add {bulkNames.length || ''} visit{bulkNames.length === 1 ? '' : 's'}
            </button>
          </>
        }
      >
        <label className="field-label" htmlFor="bulk-names">
          Dealership names, one per line
        </label>
        <textarea id="bulk-names" className="input min-h-[200px] font-mono text-[13px]" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Suzuki Montana\nSuzuki Menlyn\nSuzuki Centurion\nSuzuki Bryanston'} autoFocus />
        <p className="mt-2 text-xs text-muted">Paste straight from Excel. Names that match a saved dealership are linked to it. A name listed twice creates two separate visits.</p>
        {bulkNames.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {bulkNames.map((n, i) => {
              const known = data.dealerships.some((d) => d.name.toLowerCase() === n.toLowerCase());
              return (
                <span key={i} className={`rounded px-2 py-0.5 text-xs ${known ? 'bg-surface2' : 'bg-accent-soft text-accent'}`}>
                  {n}
                  {!known && ' (new)'}
                </span>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
