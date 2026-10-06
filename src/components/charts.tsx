// Small, theme-aware chart pieces built from HTML so long question and dealer
// names wrap cleanly and colours follow light and dark mode.

import type { ReactNode } from 'react';
import { fmtPct } from '../lib/calc';
import { useBand, bandTextClass } from './ui';
import { useUi } from '../store/ui';

export interface BarItem {
  key: string;
  label: ReactNode;
  prefix?: ReactNode;
  pct: number | null;
  detail?: string;
}

const fill = { good: 'bg-yes', fair: 'bg-warn', poor: 'bg-no', none: 'bg-line' } as const;

/** Horizontal percentage bars on a fixed 0-100% scale, with target lines. */
export function BarList({ items, empty = 'No results yet.' }: { items: BarItem[]; empty?: string }) {
  const bandOf = useBand();
  const t = useUi((s) => s.thresholds);
  if (items.length === 0) return <p className="px-1 py-4 text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((it) => {
        const b = bandOf(it.pct);
        return (
          <li key={it.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1" title={it.detail}>
            <div className="flex min-w-0 items-baseline gap-2 text-sm">
              {it.prefix && <span className="num shrink-0 text-xs font-semibold text-muted">{it.prefix}</span>}
              <span className="min-w-0 leading-snug">{it.label}</span>
            </div>
            <span className={`num row-span-2 self-end text-right text-sm font-semibold ${bandTextClass(b)}`}>{fmtPct(it.pct)}</span>
            <div className="relative h-2.5 rounded-full bg-surface2">
              <div className={`h-full rounded-full ${fill[b]}`} style={{ width: `${Math.max(0, Math.min(100, it.pct ?? 0))}%` }} />
              <span className="absolute top-[-2px] h-[14px] w-px bg-ink/25" style={{ left: `${t.good}%` }} aria-hidden />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** How many visits fall in each 10% score band. */
export function ScoreHistogram({ scores }: { scores: number[] }) {
  const bandOf = useBand();
  const bins = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, n: 0 }));
  for (const s of scores) bins[Math.min(9, Math.floor(s / 10))].n++;
  const max = Math.max(1, ...bins.map((b) => b.n));
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5 border-b border-line">
        {bins.map((b) => (
          <div key={b.from} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`${b.n} visit${b.n === 1 ? '' : 's'} scored ${b.from}-${b.from === 90 ? 100 : b.from + 9}%`}>
            {b.n > 0 && <span className="num mb-1 text-xs font-semibold">{b.n}</span>}
            <div className={`w-full rounded-t-[4px] ${fill[bandOf(b.from + 5)]} opacity-90 group-hover:opacity-100`} style={{ height: `${(b.n / max) * 80}%`, minHeight: b.n ? 4 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {bins.map((b) => (
          <span key={b.from} className="num flex-1 text-center text-[10px] text-muted">
            {b.from}
          </span>
        ))}
      </div>
      <div className="mt-1 text-center text-[11px] text-muted">Visit score (%)</div>
    </div>
  );
}

/** Yes / No / N/A / unanswered split for one question as a single stacked bar. */
export function AnswerMix({ yes, no, na, unanswered, reverse }: { yes: number; no: number; na: number; unanswered: number; reverse?: boolean }) {
  const total = yes + no + na + unanswered;
  if (!total) return null;
  const seg = (n: number, cls: string, label: string) => (n ? <div className={`h-full ${cls}`} style={{ width: `${(n / total) * 100}%` }} title={`${label}: ${n}`} /> : null);
  return (
    <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
      {seg(yes, reverse ? 'bg-no' : 'bg-yes', 'Yes')}
      {seg(no, reverse ? 'bg-yes' : 'bg-no', 'No')}
      {seg(na, 'bg-na/50', 'N/A')}
      {seg(unanswered, 'bg-line', 'Not answered')}
    </div>
  );
}
