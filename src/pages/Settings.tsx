import { useRef, useState } from 'react';
import { Database, Download, ImagePlus, Palette, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { getData, nowIso, replaceAll, remove, uid, upsert, useData, useStore } from '../store/store';
import { setUi, useUi, selectExercise } from '../store/ui';
import { deleteSampleData, hasSampleData, loadSampleData } from '../store/actions';
import { ConfirmButton, OemMark, PageHeader, toast } from '../components/ui';
import { saveFile } from '../lib/download';
import { COLLECTION_NAMES, type Collections, type Oem } from '../lib/types';

async function resizeImage(file: File, max = 320): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Settings() {
  const data = useData();
  const storage = useStore((s) => s.storage);
  const thresholds = useUi((s) => s.thresholds);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<Collections | null>(null);
  const [newOem, setNewOem] = useState('');

  const exportBackup = async () => {
    const payload = { app: 'mystery-shop', format: 1, exportedAt: nowIso(), data: getData() };
    const r = await saveFile(`Mystery_Shop_Backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 1));
    if (r === 'saved') toast('Backup saved.');
  };

  const readBackup = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      const d = (json.data ?? json) as Partial<Collections>;
      if (!COLLECTION_NAMES.every((k) => Array.isArray(d[k] ?? []))) throw new Error('bad');
      const full = Object.fromEntries(COLLECTION_NAMES.map((k) => [k, d[k] ?? []])) as unknown as Collections;
      setPendingRestore(full);
    } catch {
      toast('That file is not a Mystery Shop backup.', 'err');
    }
  };

  const oemUsage = (o: Oem) => data.exercises.filter((e) => e.oemId === o.id).length;

  return (
    <>
      <PageHeader title="Settings" subtitle="Brands, templates, scoring colours and your data." />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card p-5 xl:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
            <Palette size={18} /> OEMs and branding
          </h2>
          <p className="mb-4 text-sm text-muted">The logo and colour appear on dashboards, the PDF report and the Excel summary.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {data.oems.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-md border border-line p-3">
                <OemMark name={o.name} logo={o.logo} color={o.color} size={40} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <input className="input py-1 font-semibold" defaultValue={o.name} key={o.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== o.name && upsert('oems', { ...o, name: e.target.value.trim() })} aria-label="OEM name" />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <label className="btn-secondary cursor-pointer px-2 py-1 text-xs">
                      <ImagePlus size={13} /> {o.logo ? 'Change logo' : 'Add logo'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            upsert('oems', { ...o, logo: await resizeImage(f) });
                            toast('Logo updated.');
                          } catch {
                            toast('That image could not be read.', 'err');
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {o.logo && (
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => upsert('oems', { ...o, logo: undefined })}>
                        Remove logo
                      </button>
                    )}
                    <label className="flex items-center gap-1.5 text-muted">
                      Colour
                      <input type="color" value={o.color ?? '#1c58b2'} onChange={(e) => upsert('oems', { ...o, color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent" />
                    </label>
                    <span className="text-muted">
                      {oemUsage(o)} exercise{oemUsage(o) === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                {oemUsage(o) === 0 && (
                  <ConfirmButton className="btn-ghost px-2 text-no" confirmText="Delete?" title="Delete OEM" onConfirm={() => remove('oems', o.id)}>
                    <Trash2 size={15} />
                  </ConfirmButton>
                )}
              </div>
            ))}
          </div>
          <form
            className="mt-4 flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = newOem.trim();
              if (!n) return;
              if (data.oems.some((o) => o.name.toLowerCase() === n.toLowerCase())) return toast('That OEM already exists.', 'err');
              upsert('oems', { id: uid(), name: n, createdAt: nowIso() });
              setNewOem('');
            }}
          >
            <input className="input" placeholder="Add an OEM, e.g. BYD" value={newOem} onChange={(e) => setNewOem(e.target.value)} aria-label="New OEM name" />
            <button className="btn-secondary shrink-0" type="submit">
              <Plus size={16} /> Add
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 font-display text-lg font-semibold">Score colours</h2>
          <p className="mb-4 text-sm text-muted">Sets when a percentage shows green, amber or red. It changes colours only, never the numbers.</p>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="field-label" htmlFor="th-good">
                Green from (%)
              </label>
              <input id="th-good" type="number" min={1} max={100} className="input w-28" value={thresholds.good} onChange={(e) => setUi({ thresholds: { ...thresholds, good: Math.min(100, Math.max(thresholds.fair + 1, Number(e.target.value) || 0)) } })} />
            </div>
            <div>
              <label className="field-label" htmlFor="th-fair">
                Amber from (%)
              </label>
              <input id="th-fair" type="number" min={0} max={99} className="input w-28" value={thresholds.fair} onChange={(e) => setUi({ thresholds: { ...thresholds, fair: Math.max(0, Math.min(thresholds.good - 1, Number(e.target.value) || 0)) } })} />
            </div>
            <div className="flex gap-1.5 pb-2 text-xs font-semibold">
              <span className="rounded bg-no-soft px-2 py-1 text-no">below {thresholds.fair}%</span>
              <span className="rounded bg-warn-soft px-2 py-1 text-warn">
                {thresholds.fair} to {thresholds.good - 1}%
              </span>
              <span className="rounded bg-yes-soft px-2 py-1 text-yes">{thresholds.good}% +</span>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 font-display text-lg font-semibold">Saved questionnaire templates</h2>
          <p className="mb-3 text-sm text-muted">Save any questionnaire as a template from its builder. Built-in templates cannot be removed.</p>
          {data.templates.length === 0 ? (
            <p className="text-sm text-muted">No saved templates yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.templates.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="text-xs text-muted">
                      {t.sections.length} sections · {t.sections.reduce((a, s) => a + s.questions.filter((q) => !q.isGroup).length, 0)} questions
                    </div>
                  </div>
                  <ConfirmButton className="btn-ghost px-2 text-no" confirmText="Delete?" onConfirm={() => remove('templates', t.id)}>
                    <Trash2 size={15} />
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
            <Database size={18} /> Your data
          </h2>
          <p className="mb-1 text-sm">{storage?.description}</p>
          <p className="num mb-4 text-xs text-muted">
            {data.exercises.length} exercises · {data.visits.length} visits · {data.dealerships.length} dealerships · {data.oems.length} OEMs
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={exportBackup}>
              <Download size={16} /> Download backup
            </button>
            <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Restore from backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readBackup(f);
                e.target.value = '';
              }}
            />
          </div>
          {pendingRestore && (
            <div className="mt-4 rounded-md border border-warn/40 bg-warn-soft/50 p-3 text-sm">
              <p>
                This backup has {pendingRestore.exercises.length} exercises and {pendingRestore.visits.length} visits. Restoring replaces everything currently saved.
              </p>
              <div className="mt-3 flex gap-2">
                <button className="btn-secondary" onClick={() => setPendingRestore(null)}>
                  Cancel
                </button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    replaceAll(pendingRestore);
                    selectExercise(null);
                    setPendingRestore(null);
                    toast('Backup restored.');
                  }}
                >
                  Replace my data
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
            <Sparkles size={18} /> Sample data
          </h2>
          <p className="mb-4 text-sm text-muted">A sample exercise with 19 visits, using the dealer names from the April 2026 Blood Chart and made-up answers. Use it to try the screens, then delete it.</p>
          {hasSampleData() ? (
            <ConfirmButton
              className="btn-danger"
              confirmText="Click again to delete sample data"
              onConfirm={() => {
                deleteSampleData();
                selectExercise(null);
                toast('Sample data deleted.');
              }}
            >
              <Trash2 size={16} /> Delete sample data
            </ConfirmButton>
          ) : (
            <button
              className="btn-secondary"
              onClick={() => {
                const ex = loadSampleData();
                selectExercise(ex.id);
                toast('Sample exercise loaded.');
              }}
            >
              <Sparkles size={16} /> Load sample data
            </button>
          )}
        </section>
      </div>
    </>
  );
}
