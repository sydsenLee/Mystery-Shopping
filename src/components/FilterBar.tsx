import { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { useData } from '../store/store';
import { defaultFilters, selectExercise, setFilters, useUi } from '../store/ui';
import { mergeVersions, numberSections } from '../lib/calc';
import { MultiSelect } from './ui';

/** One filter bar for Blood Chart, Analytics and Reports. Every figure on those screens follows it. */
export function FilterBar({ excludedInProgress = 0 }: { excludedInProgress?: number }) {
  const data = useData();
  const exerciseId = useUi((s) => s.exerciseId);
  const filters = useUi((s) => s.filters);
  const exercise = data.exercises.find((e) => e.id === exerciseId);
  const oemId = exercise?.oemId ?? '';

  const { sections, numbered, dealerOpts, regions } = useMemo(() => {
    const versions = data.versions.filter((v) => v.exerciseId === exerciseId);
    const merged = mergeVersions(versions);
    const visits = data.visits.filter((v) => v.exerciseId === exerciseId);
    const dIds = new Set(visits.map((v) => v.dealershipId));
    const ds = data.dealerships.filter((d) => dIds.has(d.id)).sort((a, b) => a.name.localeCompare(b.name));
    return {
      sections: merged.sections,
      numbered: numberSections(merged.sections),
      dealerOpts: ds.map((d) => ({ value: d.id, label: d.name })),
      regions: [...new Set(ds.map((d) => d.region ?? ''))].sort(),
    };
  }, [data, exerciseId]);

  const active = filters.dealershipIds.length + filters.regions.length + filters.sectionIds.length + filters.questionIds.length + (filters.dateFrom ? 1 : 0) + (filters.dateTo ? 1 : 0);
  const exercisesForOem = data.exercises.filter((e) => !oemId || e.oemId === oemId);

  return (
    <div className="card mb-5 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-9">
        <div className="min-w-0">
          <label className="field-label" htmlFor="f-oem">
            OEM
          </label>
          <select
            id="f-oem"
            className="input"
            value={oemId}
            onChange={(e) => {
              const first = data.exercises.filter((x) => x.oemId === e.target.value).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
              selectExercise(first?.id ?? null);
            }}
          >
            {!oemId && <option value="">Choose</option>}
            {data.oems
              .filter((o) => data.exercises.some((e) => e.oemId === o.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </div>
        <div className="col-span-1 min-w-0 md:col-span-1 xl:col-span-2">
          <label className="field-label" htmlFor="f-ex">
            Exercise
          </label>
          <select id="f-ex" className="input" value={exerciseId ?? ''} onChange={(e) => selectExercise(e.target.value || null)}>
            {!exerciseId && <option value="">Choose</option>}
            {exercisesForOem.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <MultiSelect label="Dealership" options={dealerOpts} value={filters.dealershipIds} onChange={(v) => setFilters({ dealershipIds: v })} />
        <MultiSelect label="Region" options={regions.map((r) => ({ value: r, label: r || '(no region)' }))} value={filters.regions} onChange={(v) => setFilters({ regions: v })} />
        <div className="min-w-0">
          <label className="field-label" htmlFor="f-from">
            Visit date from
          </label>
          <input id="f-from" type="date" className="input" value={filters.dateFrom} onChange={(e) => setFilters({ dateFrom: e.target.value })} />
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor="f-to">
            to
          </label>
          <input id="f-to" type="date" className="input" value={filters.dateTo} onChange={(e) => setFilters({ dateTo: e.target.value })} />
        </div>
        <MultiSelect label="Section" options={sections.map((s, i) => ({ value: s.id, label: `${i + 1}. ${s.title}` }))} value={filters.sectionIds} onChange={(v) => setFilters({ sectionIds: v })} />
        <MultiSelect
          label="Question"
          options={numbered.filter((n) => !n.q.isGroup && (!filters.sectionIds.length || filters.sectionIds.includes(n.section.id))).map((n) => ({ value: n.q.id, label: n.q.text, group: n.code }))}
          value={filters.questionIds}
          onChange={(v) => setFilters({ questionIds: v })}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={filters.includeInProgress} onChange={(e) => setFilters({ includeInProgress: e.target.checked })} />
          Include visits still in progress
        </label>
        {excludedInProgress > 0 && !filters.includeInProgress && (
          <span className="text-xs text-muted">
            {excludedInProgress} in-progress visit{excludedInProgress === 1 ? ' is' : 's are'} not counted.
          </span>
        )}
        {active > 0 && (
          <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => setFilters({ ...defaultFilters(), includeInProgress: filters.includeInProgress })}>
            <RotateCcw size={13} /> Clear {active} filter{active === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </div>
  );
}
