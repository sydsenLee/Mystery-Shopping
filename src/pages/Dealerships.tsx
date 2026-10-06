import { Fragment, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Building2, ChevronDown, ChevronRight, GitMerge, ListPlus, Search } from 'lucide-react';
import { useData, upsert, upsertMany, remove, nowIso } from '../store/store';
import { findOrCreateDealership, normaliseName } from '../store/actions';
import { buildContext, visitTally, emptyTally, addTally } from '../lib/calc';
import { EmptyState, Modal, PageHeader, PctBadge, toast } from '../components/ui';
import type { Dealership, ID } from '../lib/types';

export default function Dealerships() {
  const data = useData();
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<ID | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState('');
  const [bulkRegion, setBulkRegion] = useState('');
  const [mergeFrom, setMergeFrom] = useState<Dealership | null>(null);
  const [mergeTo, setMergeTo] = useState('');

  // Score history per dealership, computed per exercise so each visit is scored on its own questionnaire.
  const stats = useMemo(() => {
    const out = new Map<ID, { visits: { id: ID; exercise: string; date?: string; pct: number | null; status: string }[]; tally: ReturnType<typeof emptyTally> }>();
    for (const ex of data.exercises) {
      const visits = data.visits.filter((v) => v.exerciseId === ex.id);
      if (!visits.length) continue;
      const ctx = buildContext(
        data.versions.filter((v) => v.exerciseId === ex.id),
        visits,
      );
      for (const v of visits) {
        const t = visitTally(ctx, v);
        const s = out.get(v.dealershipId) ?? { visits: [], tally: emptyTally() };
        s.visits.push({ id: v.id, exercise: ex.name, date: v.visitDate, pct: t.pct, status: v.status });
        if (v.status === 'complete') addTally(s.tally, t);
        out.set(v.dealershipId, s);
      }
    }
    return out;
  }, [data]);

  const regions = useMemo(() => [...new Set(data.dealerships.map((d) => d.region).filter(Boolean) as string[])].sort(), [data.dealerships]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.dealerships
      .filter((d) => (showArchived || !d.archived) && (!region || d.region === region) && (!s || [d.name, d.city, d.region, d.code].some((x) => x?.toLowerCase().includes(s))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.dealerships, q, region, showArchived]);

  const save = (d: Dealership, patch: Partial<Dealership>) => upsert('dealerships', { ...d, ...patch });

  const bulkNames = [...new Set(bulk.split(/\n|;/).map(normaliseName).filter(Boolean))];

  const doMerge = () => {
    if (!mergeFrom || !mergeTo) return;
    const moved = data.visits.filter((v) => v.dealershipId === mergeFrom.id).map((v) => ({ ...v, dealershipId: mergeTo, updatedAt: nowIso() }));
    if (moved.length) upsertMany('visits', moved);
    remove('dealerships', mergeFrom.id);
    toast(`Merged. ${moved.length} visit${moved.length === 1 ? '' : 's'} moved.`);
    setMergeFrom(null);
    setMergeTo('');
  };

  return (
    <>
      <PageHeader
        title="Dealerships"
        subtitle="The saved dealership list keeps names consistent across every exercise. Visits to the same dealership are reported together."
        actions={
          <button className="btn-primary" onClick={() => setBulkOpen(true)}>
            <ListPlus size={16} /> Add dealerships
          </button>
        }
      />
      {data.dealerships.length === 0 ? (
        <EmptyState icon={<Building2 size={36} />} title="No dealerships yet" action={<button className="btn-primary" onClick={() => setBulkOpen(true)}><ListPlus size={16} /> Add dealerships</button>}>
          Paste a list of dealership names, or add them while capturing visits.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Search name, city, region or code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search dealerships" />
            </div>
            <select className="input w-auto" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Filter by region">
              <option value="">All regions</option>
              {regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
            </label>
            <span className="num ml-auto text-sm text-muted">{rows.length} dealerships</span>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface2/60 text-left">
                    <th className="w-8" />
                    <th className="label-caps px-3 py-2.5">Dealership name</th>
                    <th className="label-caps px-3 py-2.5">Brand</th>
                    <th className="label-caps px-3 py-2.5">Region</th>
                    <th className="label-caps px-3 py-2.5">City</th>
                    <th className="label-caps px-3 py-2.5">Code</th>
                    <th className="label-caps px-3 py-2.5 text-right">Visits</th>
                    <th className="label-caps px-3 py-2.5 text-right">All-time score</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const s = stats.get(d.id);
                    const isOpen = open === d.id;
                    return (
                      <Fragment key={d.id}>
                        <tr className={`border-b border-line/60 ${d.archived ? 'opacity-60' : ''}`}>
                          <td className="pl-2">
                            <button className="btn-ghost px-1.5 py-1" onClick={() => setOpen(isOpen ? null : d.id)} aria-label="Show visit history" aria-expanded={isOpen} disabled={!s}>
                              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </td>
                          <td className="px-3 py-1.5">
                            <input className="input border-transparent bg-transparent py-1 font-medium hover:border-line" defaultValue={d.name} key={d.name} onBlur={(e) => {
                              const v = normaliseName(e.target.value);
                              if (!v || v === d.name) return void (e.target.value = d.name);
                              if (data.dealerships.some((x) => x.id !== d.id && x.name.toLowerCase() === v.toLowerCase())) {
                                toast('Another dealership already has that name. Use Merge instead.', 'err');
                                e.target.value = d.name;
                                return;
                              }
                              save(d, { name: v });
                            }} aria-label="Dealership name" />
                          </td>
                          <td className="px-3 py-1.5">
                            <select className="input py-1" value={d.oemId ?? ''} onChange={(e) => save(d, { oemId: e.target.value || undefined })} aria-label="Brand">
                              <option value="">-</option>
                              {data.oems.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <input className="input w-32 py-1" list="region-list" defaultValue={d.region ?? ''} key={'r' + d.region} onBlur={(e) => e.target.value.trim() !== (d.region ?? '') && save(d, { region: e.target.value.trim() || undefined })} aria-label="Region" />
                          </td>
                          <td className="px-3 py-1.5">
                            <input className="input w-32 py-1" defaultValue={d.city ?? ''} key={'c' + d.city} onBlur={(e) => e.target.value.trim() !== (d.city ?? '') && save(d, { city: e.target.value.trim() || undefined })} aria-label="City" />
                          </td>
                          <td className="px-3 py-1.5">
                            <input className="input w-24 py-1" defaultValue={d.code ?? ''} key={'k' + d.code} onBlur={(e) => e.target.value.trim() !== (d.code ?? '') && save(d, { code: e.target.value.trim() || undefined })} aria-label="Dealer code" />
                          </td>
                          <td className="num px-3 py-1.5 text-right">{s?.visits.length ?? 0}</td>
                          <td className="px-3 py-1.5 text-right">
                            <PctBadge pct={s?.tally.pct ?? null} size="sm" />
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex justify-end gap-1">
                              <button className="btn-ghost px-2 py-1" title="Merge into another dealership (fixes duplicates)" onClick={() => setMergeFrom(d)}>
                                <GitMerge size={15} />
                              </button>
                              <button className="btn-ghost px-2 py-1" title={d.archived ? 'Restore' : 'Archive (hide from pick lists)'} onClick={() => save(d, { archived: !d.archived })}>
                                {d.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && s && (
                          <tr className="border-b border-line/60 bg-surface2/40">
                            <td />
                            <td colSpan={8} className="px-3 py-3">
                              <div className="label-caps mb-2">Visit history</div>
                              <ul className="space-y-1">
                                {s.visits.map((v) => (
                                  <li key={v.id} className="flex items-center gap-3 text-sm">
                                    <span className="num w-24 text-muted">{v.date ?? '-'}</span>
                                    <span className="min-w-0 flex-1 truncate">{v.exercise}</span>
                                    {v.status !== 'complete' && <span className="text-xs text-warn">In progress</span>}
                                    <PctBadge pct={v.pct} size="sm" />
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              <datalist id="region-list">
                {regions.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          </div>
        </>
      )}

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Add dealerships"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBulkOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!bulkNames.length}
              onClick={() => {
                const known = new Set(data.dealerships.map((d) => d.name.toLowerCase()));
                const added = bulkNames.filter((n) => !known.has(n.toLowerCase())).length;
                for (const n of bulkNames) findOrCreateDealership(n, bulkRegion.trim() ? { region: bulkRegion.trim() } : {});
                toast(`${added} dealership${added === 1 ? '' : 's'} added. Existing names were skipped.`);
                setBulk('');
                setBulkOpen(false);
              }}
            >
              Add {bulkNames.length || ''}
            </button>
          </>
        }
      >
        <label className="field-label" htmlFor="dl-bulk">
          Dealership names, one per line
        </label>
        <textarea id="dl-bulk" className="input min-h-[180px] font-mono text-[13px]" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Suzuki Montana\nSuzuki Menlyn\nSuzuki Centurion'} autoFocus />
        <label className="field-label mt-3" htmlFor="dl-region">
          Region for these dealerships (optional)
        </label>
        <input id="dl-region" className="input" list="region-list" value={bulkRegion} onChange={(e) => setBulkRegion(e.target.value)} placeholder="e.g. Gauteng North" />
      </Modal>

      <Modal
        open={!!mergeFrom}
        onClose={() => setMergeFrom(null)}
        title="Merge duplicate dealership"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setMergeFrom(null)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={!mergeTo} onClick={doMerge}>
              Merge
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm">
          All visits for <strong>{mergeFrom?.name}</strong> move to the dealership you pick, and "{mergeFrom?.name}" is removed from the list.
        </p>
        <label className="field-label" htmlFor="merge-to">
          Keep this dealership
        </label>
        <select id="merge-to" className="input" value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}>
          <option value="">Choose</option>
          {data.dealerships
            .filter((d) => d.id !== mergeFrom?.id)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </Modal>
    </>
  );
}
