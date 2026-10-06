import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { X, Check, Search, Plus } from 'lucide-react';
import { band, fmtPct, type Band } from '../lib/calc';
import { useUi } from '../store/ui';
import type { Dealership } from '../lib/types';

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="label-caps mb-1">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-semibold leading-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function useBand() {
  const t = useUi((s) => s.thresholds);
  return (p: number | null | undefined) => band(p, t);
}

const bandClass: Record<Band, string> = {
  good: 'bg-yes-soft text-yes',
  fair: 'bg-warn-soft text-warn',
  poor: 'bg-no-soft text-no',
  none: 'bg-surface2 text-muted',
};

export function PctBadge({ pct, size = 'md', digits = 0 }: { pct: number | null | undefined; size?: 'sm' | 'md' | 'lg'; digits?: number }) {
  const b = useBand()(pct);
  const sz = size === 'lg' ? 'px-2.5 py-1 text-base' : size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-sm';
  return <span className={`num inline-flex min-w-[3.25rem] justify-center rounded font-semibold ${sz} ${bandClass[b]}`}>{fmtPct(pct, digits)}</span>;
}

export function bandTextClass(b: Band) {
  return b === 'good' ? 'text-yes' : b === 'fair' ? 'text-warn' : b === 'poor' ? 'text-no' : 'text-muted';
}

export function ProgressBar({ value, max, tone = 'accent' }: { value: number; max: number; tone?: 'accent' | 'yes' }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={`h-full rounded-full ${tone === 'yes' ? 'bg-yes' : 'bg-accent'} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-xl`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** A delete/danger button that asks for a second click instead of a browser dialog. */
export function ConfirmButton({ onConfirm, children, confirmText = 'Click again to confirm', className = 'btn-danger', title }: { onConfirm: () => void; children: ReactNode; confirmText?: string; className?: string; title?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      title={title}
      className={className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmText : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toasts

type ToastMsg = { id: number; text: string; tone: 'ok' | 'err' };
let toastListeners: ((t: ToastMsg[]) => void)[] = [];
let toasts: ToastMsg[] = [];
let toastId = 0;
export function toast(text: string, tone: 'ok' | 'err' = 'ok') {
  const t = { id: ++toastId, text, tone };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((l) => l(toasts));
  }, 3500);
}
export function Toasts() {
  const [list, setList] = useState<ToastMsg[]>([]);
  useEffect(() => {
    toastListeners.push(setList);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setList);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`pointer-events-auto rounded-md px-4 py-2.5 text-sm font-medium shadow-lg ${t.tone === 'err' ? 'bg-no text-on-status' : 'bg-ink text-bg'}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dealership picker: type to search the saved list, or add a new name.

export function DealershipPicker({ dealerships, onPick, placeholder = 'Type a dealership name', autoFocus }: { dealerships: Dealership[]; onPick: (d: Dealership | string) => void; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = dealerships.filter((d) => !d.archived && (!s || d.name.toLowerCase().includes(s) || d.region?.toLowerCase().includes(s)));
    return list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12);
  }, [q, dealerships]);
  const exact = dealerships.some((d) => d.name.toLowerCase() === q.trim().toLowerCase());
  const options: (Dealership | string)[] = [...matches, ...(q.trim() && !exact ? [q.trim()] : [])];

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const choose = (o: Dealership | string) => {
    onPick(o);
    setQ('');
    setOpen(false);
    setHi(0);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className="input pl-9"
          value={q}
          autoFocus={autoFocus}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setHi(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHi((h) => Math.min(h + 1, options.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter' && options[hi] !== undefined) {
              e.preventDefault();
              choose(options[hi]);
            } else if (e.key === 'Escape') setOpen(false);
          }}
        />
      </div>
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" className="card absolute z-30 mt-1 max-h-72 w-full overflow-auto py-1 shadow-lg">
          {options.map((o, i) => (
            <li
              key={typeof o === 'string' ? 'new' : o.id}
              role="option"
              aria-selected={i === hi}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${i === hi ? 'bg-accent-soft' : ''}`}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
            >
              {typeof o === 'string' ? (
                <span className="flex items-center gap-2 font-medium text-accent">
                  <Plus size={15} /> Add new dealership "{o}"
                </span>
              ) : (
                <>
                  <span className="truncate">{o.name}</span>
                  {o.region && <span className="shrink-0 text-xs text-muted">{o.region}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MultiSelect({ label, options, value, onChange, placeholder = 'All' }: { label: string; options: { value: string; label: string; group?: string }[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  const summary = value.length === 0 ? placeholder : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? '1 selected' : `${value.length} selected`;
  return (
    <div className="relative min-w-0" ref={ref}>
      <span className="field-label">{label}</span>
      <button type="button" className={`input flex items-center justify-between text-left ${value.length ? 'border-accent/60' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`truncate ${value.length ? 'text-ink' : 'text-muted'}`}>{summary}</span>
        <span className="ml-2 text-muted">▾</span>
      </button>
      {open && (
        <div className="card absolute z-30 mt-1 w-72 max-w-[85vw] shadow-lg">
          {options.length > 8 && (
            <div className="border-b border-line p-2">
              <input className="input py-1.5" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </div>
          )}
          <ul className="max-h-72 overflow-auto py-1">
            {shown.map((o) => {
              const on = value.includes(o.value);
              return (
                <li key={o.value}>
                  <button type="button" className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface2" onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-accent bg-accent text-accent-ink' : 'border-line'}`}>{on && <Check size={12} />}</span>
                    <span className="min-w-0">
                      {o.group && <span className="mr-1 text-muted">{o.group}</span>}
                      {o.label}
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">No matches</li>}
          </ul>
          {value.length > 0 && (
            <div className="border-t border-line p-2 text-right">
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onChange([])}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Band }) {
  return (
    <div className="card min-w-0 px-4 py-3.5">
      <div className="label-caps">{label}</div>
      <div className={`num mt-1 font-display text-[28px] font-semibold leading-none ${tone ? bandTextClass(tone) : ''}`}>{value}</div>
      {sub && <div className="mt-1.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function OemMark({ name, logo, color, size = 28 }: { name?: string; logo?: string; color?: string; size?: number }) {
  if (logo) return <img src={logo} alt={name ?? ''} style={{ height: size, width: 'auto', maxWidth: size * 3 }} className="shrink-0 rounded object-contain" />;
  const initials = (name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded font-display font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.42, background: color || 'rgb(var(--muted))' }}>
      {initials}
    </span>
  );
}
