import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Keyboard, MessageSquarePlus, RotateCcw, Search, AlertTriangle } from 'lucide-react';
import { useData } from '../store/store';
import { rememberCaptureVisit, useUi } from '../store/ui';
import { useCurrentExercise } from '../store/hooks';
import { createVisit, findOrCreateDealership, latestVersion, setComment, setResponse, updateVisit, upgradeVisit } from '../store/actions';
import { buildContext, canComplete, isAnswerable, numberSections, visitProgress, visitTally, type NumberedQuestion } from '../lib/calc';
import { visitDisplayLabels } from '../lib/report';
import { DealershipPicker, EmptyState, PageHeader, PctBadge, ProgressBar, toast } from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';
import type { Question, ResponseEntry, Visit } from '../lib/types';

export default function Capture() {
  const { exercise } = useCurrentExercise();
  const data = useData();
  const remembered = useUi((s) => (exercise ? s.captureVisit[exercise.id] : undefined));
  const [listQuery, setListQuery] = useState('');
  const [showDone, setShowDone] = useState(true);

  const visits = useMemo(() => (exercise ? data.visits.filter((v) => v.exerciseId === exercise.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []), [data.visits, exercise]);
  const versions = useMemo(() => (exercise ? data.versions.filter((v) => v.exerciseId === exercise.id) : []), [data.versions, exercise]);
  const dealers = useMemo(() => new Map(data.dealerships.map((d) => [d.id, d])), [data.dealerships]);
  const labels = useMemo(() => visitDisplayLabels(visits, dealers), [visits, dealers]);
  const current = visits.find((v) => v.id === remembered) ?? visits.find((v) => v.status !== 'complete') ?? visits[0];

  if (!exercise)
    return (
      <>
        <PageHeader title="Data Capture" subtitle="Choose the exercise you are capturing." />
        <ExercisePicker />
      </>
    );

  const select = (v: Visit) => rememberCaptureVisit(exercise.id, v.id);
  const idx = current ? visits.indexOf(current) : -1;
  const shownVisits = visits.filter((v) => (showDone || v.status !== 'complete' || v.id === current?.id) && (!listQuery || (labels.get(v.id) ?? '').toLowerCase().includes(listQuery.toLowerCase()) || (v.team ?? '').toLowerCase().includes(listQuery.toLowerCase())));
  const doneCount = visits.filter((v) => v.status === 'complete').length;

  const addVisit = (d: Parameters<Parameters<typeof DealershipPicker>[0]['onPick']>[0]) => {
    const dealer = typeof d === 'string' ? findOrCreateDealership(d) : d;
    const v = createVisit(exercise.id, dealer.id);
    select(v);
    toast(`Visit added: ${dealer.name}`);
  };

  const goNext = () => {
    if (!current) return;
    const after = [...visits.slice(idx + 1), ...visits.slice(0, idx)];
    const next = after.find((v) => v.status !== 'complete') ?? visits[idx + 1];
    if (next) select(next);
    else toast('That was the last visit. Add the next dealership above.');
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
      {/* Visit list */}
      <aside className="min-w-0 lg:sticky lg:top-0 lg:h-[calc(100vh-3rem)] lg:overflow-hidden">
        <div className="card flex h-full flex-col overflow-hidden">
          <div className="space-y-2.5 border-b border-line p-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Dealership visits</h2>
              <span className="num text-xs text-muted">
                {doneCount}/{visits.length} complete
              </span>
            </div>
            <DealershipPicker dealerships={data.dealerships} onPick={addVisit} placeholder="Add visit: type dealership" />
            {visits.length > 6 && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input className="input py-1.5 pl-8 text-xs" placeholder="Find a visit" value={listQuery} onChange={(e) => setListQuery(e.target.value)} aria-label="Find a visit" />
                </div>
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Done
                </label>
              </div>
            )}
          </div>
          <ul className="max-h-[260px] flex-1 overflow-y-auto lg:max-h-none">
            {shownVisits.map((v) => {
              const ver = versions.find((x) => x.id === v.questionnaireVersionId);
              const p = visitProgress(ver, v);
              const active = v.id === current?.id;
              return (
                <li key={v.id}>
                  <button className={`flex w-full items-center gap-3 border-b border-line/60 px-3 py-2.5 text-left ${active ? 'bg-accent-soft' : 'hover:bg-surface2/60'}`} onClick={() => select(v)} aria-current={active}>
                    {v.status === 'complete' ? <CheckCircle2 size={18} className="shrink-0 text-yes" /> : <span className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-line" />}
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm ${active ? 'font-semibold' : 'font-medium'}`}>{labels.get(v.id)}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <ProgressBar value={p.answered} max={p.answerable} tone={v.status === 'complete' ? 'yes' : 'accent'} />
                        <span className="num shrink-0 text-[11px] text-muted">
                          {p.answered}/{p.answerable}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
            {visits.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Type a dealership name above to start the first visit.</li>}
          </ul>
        </div>
      </aside>

      {/* Form */}
      <div className="min-w-0">
        {current ? (
          <VisitForm
            key={current.id}
            visit={current}
            label={labels.get(current.id) ?? ''}
            position={`${idx + 1} of ${visits.length}`}
            onPrev={idx > 0 ? () => select(visits[idx - 1]) : undefined}
            onNext={goNext}
            exerciseName={exercise.name}
          />
        ) : (
          <EmptyState icon={<ClipboardCheck size={36} />} title="No visits yet">
            Add the first dealership visit in the panel {typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'on the left' : 'above'}. You can also paste a whole list under{' '}
            <Link className="text-accent underline" to={`/exercises/${exercise.id}/visits`}>
              Dealership visits
            </Link>
            .
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function VisitForm({ visit, label, position, onPrev, onNext, exerciseName }: { visit: Visit; label: string; position: string; onPrev?: () => void; onNext: () => void; exerciseName: string }) {
  const data = useData();
  const version = data.versions.find((v) => v.id === visit.questionnaireVersionId);
  const latest = latestVersion(visit.exerciseId);
  const numbered = useMemo(() => (version ? numberSections(version.sections) : []), [version]);
  const answerable = useMemo(() => numbered.filter((n) => isAnswerable(n.q)), [numbered]);
  const progress = visitProgress(version, visit);
  const ctx = useMemo(() => buildContext(version ? [version] : [], [visit]), [version, visit]);
  const score = visitTally(ctx, visit);
  const [activeId, setActiveId] = useState<string | null>(() => answerable.find((n) => !visit.responses[n.q.id]?.value)?.q.id ?? answerable[0]?.q.id ?? null);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [notesOpen, setNotesOpen] = useState<Set<string>>(() => new Set(Object.entries(visit.responses).filter(([, r]) => r.comment).map(([k]) => k)));
  const [completeTried, setCompleteTried] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const scrollTo = (id: string | null) => {
    if (!id) return;
    const el = rowRefs.current.get(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 140 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const answer = useCallback(
    (q: Question, value: ResponseEntry['value'] | null) => {
      const prev = visit.responses[q.id]?.value;
      const next = prev === value ? null : value; // clicking the selected answer clears it
      setResponse(visit.id, q.id, next);
      if (visit.status === 'complete' && next === null && q.required) {
        updateVisit(visit.id, { status: 'in_progress', completedAt: undefined });
        toast('A required answer was cleared, so this visit is back in progress.');
      }
      if (autoAdvance && next !== null && (q.type === 'yes_no' || q.type === 'yes_no_na' || q.type === 'rating5' || q.type === 'choice')) {
        const i = answerable.findIndex((n) => n.q.id === q.id);
        const after = answerable.slice(i + 1);
        const target = after.find((n) => !visit.responses[n.q.id]?.value) ?? after[0];
        if (target) {
          setActiveId(target.q.id);
          setTimeout(() => scrollTo(target.q.id), 30);
        }
      } else setActiveId(q.id);
    },
    [visit, answerable, autoAdvance],
  );

  // Keyboard shortcuts: Y / N / A, arrows to move, Backspace to clear.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = answerable.findIndex((n) => n.q.id === activeId);
      const cur = answerable[i];
      const move = (d: number) => {
        const n = answerable[Math.min(Math.max(i + d, 0), answerable.length - 1)];
        if (n) {
          setActiveId(n.q.id);
          scrollTo(n.q.id);
        }
      };
      const k = e.key.toLowerCase();
      if (k === 'arrowdown' || k === 'j') (e.preventDefault(), move(1));
      else if (k === 'arrowup' || k === 'k') (e.preventDefault(), move(-1));
      else if (!cur) return;
      else if ((cur.q.type === 'yes_no' || cur.q.type === 'yes_no_na') && (k === 'y' || k === 'n')) answer(cur.q, k === 'y' ? 'yes' : 'no');
      else if (cur.q.type === 'yes_no_na' && (k === 'a' || k === '0')) answer(cur.q, 'na');
      else if (cur.q.type === 'rating5' && /^[1-5]$/.test(k)) answer(cur.q, Number(k));
      else if (k === 'backspace' || k === 'delete') setResponse(visit.id, cur.q.id, null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [answerable, activeId, answer, visit.id]);

  const complete = () => {
    setCompleteTried(true);
    if (!canComplete(progress)) {
      const first = answerable.find((n) => n.q.id === progress.missingRequired[0]?.id);
      if (first) {
        setActiveId(first.q.id);
        rowRefs.current.get(first.q.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      toast(`${progress.missingRequired.length} required question${progress.missingRequired.length === 1 ? ' is' : 's are'} still unanswered.`, 'err');
      return;
    }
    updateVisit(visit.id, { status: 'complete', completedAt: new Date().toISOString() });
    toast(`${label} marked complete.`);
    onNext();
  };

  const missing = new Set(progress.missingRequired.map((q) => q.id));
  const pctDone = progress.answerable ? Math.round((progress.answered / progress.answerable) * 100) : 0;

  return (
    <div>
      {/* Sticky visit header */}
      <div className="card sticky top-0 z-10 mb-4 px-4 py-3 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="label-caps">
              {exerciseName} · Visit {position}
            </div>
            <h1 className="truncate font-display text-2xl font-semibold leading-tight">{label}</h1>
            <button className="mt-0.5 text-xs text-muted hover:text-ink" onClick={() => setShowDetails((s) => !s)}>
              {[visit.team, visit.visitDate, visit.shopper].filter(Boolean).join(' · ') || 'Add visit details'} <span className="text-accent">{showDetails ? 'Hide' : 'Edit'}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-2.5" onClick={onPrev} disabled={!onPrev} aria-label="Previous visit">
              <ChevronLeft size={18} />
            </button>
            {visit.status === 'complete' ? (
              <button className="btn-secondary" onClick={() => updateVisit(visit.id, { status: 'in_progress', completedAt: undefined })}>
                <RotateCcw size={15} /> Reopen
              </button>
            ) : (
              <button className={`btn ${canComplete(progress) ? 'bg-yes text-on-status hover:bg-yes/90' : 'border border-line bg-surface text-muted'}`} onClick={complete} title={canComplete(progress) ? 'Mark this visit complete' : `${progress.missingRequired.length} required questions unanswered`}>
                <CheckCircle2 size={16} /> Mark complete
              </button>
            )}
            <button className="btn-primary" onClick={onNext}>
              Next dealership <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="min-w-[160px] flex-1">
            <ProgressBar value={progress.answered} max={progress.answerable} tone={visit.status === 'complete' ? 'yes' : 'accent'} />
          </div>
          <span className="num text-sm font-semibold">
            {progress.answered} of {progress.answerable} questions completed
          </span>
          <span className="num text-xs text-muted">{pctDone}%</span>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            Score <PctBadge pct={score.pct} size="sm" />
          </span>
          {visit.status === 'complete' && <span className="rounded bg-yes-soft px-2 py-0.5 text-xs font-semibold text-yes">Complete</span>}
        </div>
        {showDetails && (
          <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="field-label" htmlFor="vd-team">
                Team
              </label>
              <input id="vd-team" className="input py-1.5" value={visit.team ?? ''} onChange={(e) => updateVisit(visit.id, { team: e.target.value })} />
            </div>
            <div>
              <label className="field-label" htmlFor="vd-date">
                Visit date
              </label>
              <input id="vd-date" type="date" className="input py-1.5" value={visit.visitDate ?? ''} onChange={(e) => updateVisit(visit.id, { visitDate: e.target.value || undefined })} />
            </div>
            <div>
              <label className="field-label" htmlFor="vd-shopper">
                Shopper / delegate
              </label>
              <input id="vd-shopper" className="input py-1.5" value={visit.shopper ?? ''} onChange={(e) => updateVisit(visit.id, { shopper: e.target.value || undefined })} />
            </div>
            <div>
              <label className="field-label" htmlFor="vd-sp">
                Salesperson seen
              </label>
              <input id="vd-sp" className="input py-1.5" value={visit.salesperson ?? ''} onChange={(e) => updateVisit(visit.id, { salesperson: e.target.value || undefined })} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="field-label" htmlFor="vd-notes">
                Visit notes
              </label>
              <textarea id="vd-notes" className="input min-h-[60px] py-1.5" value={visit.notes ?? ''} onChange={(e) => updateVisit(visit.id, { notes: e.target.value || undefined })} />
            </div>
          </div>
        )}
      </div>

      {latest && version && latest.id !== version.id && visit.status !== 'complete' && (
        <div className="card mb-4 flex flex-wrap items-center gap-3 border-warn/40 bg-warn-soft/50 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-warn" />
          This visit uses questionnaire version {version.version}. Version {latest.version} is the latest.
          <button className="btn-secondary ml-auto py-1.5" onClick={() => upgradeVisit(visit.id)}>
            Switch to version {latest.version}
          </button>
        </div>
      )}

      {version?.sections.map((section, si) => {
        const rows = numbered.filter((n) => n.section.id === section.id);
        const answered = rows.filter((n) => isAnswerable(n.q) && visit.responses[n.q.id]?.value).length;
        const total = rows.filter((n) => isAnswerable(n.q)).length;
        return (
          <section key={section.id} className="card mb-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-surface2/60 px-4 py-2.5 sm:px-5">
              <h2 className="font-display text-lg font-semibold">
                <span className="text-muted">{si + 1}.</span> {section.title}
              </h2>
              <span className="num text-xs text-muted">
                {answered}/{total}
              </span>
            </div>
            <ul>
              {rows.map((n) => (
                <QuestionCapture
                  key={n.q.id}
                  n={n}
                  entry={visit.responses[n.q.id]}
                  active={activeId === n.q.id}
                  missing={completeTried && missing.has(n.q.id)}
                  noteOpen={notesOpen.has(n.q.id)}
                  onToggleNote={() => setNotesOpen((s) => new Set(s.has(n.q.id) ? [...s].filter((x) => x !== n.q.id) : [...s, n.q.id]))}
                  onFocus={() => setActiveId(n.q.id)}
                  onAnswer={(v) => answer(n.q, v)}
                  onText={(t) => setResponse(visit.id, n.q.id, t || null)}
                  onComment={(t) => setComment(visit.id, n.q.id, t)}
                  rowRef={(el) => (el ? rowRefs.current.set(n.q.id, el) : rowRefs.current.delete(n.q.id))}
                />
              ))}
            </ul>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3 pb-10">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} /> Jump to the next question after answering
        </label>
        <span className="hidden items-center gap-1.5 text-xs text-muted md:flex">
          <Keyboard size={14} /> Keyboard: <kbd className="rounded border border-line px-1">Y</kbd> Yes, <kbd className="rounded border border-line px-1">N</kbd> No, <kbd className="rounded border border-line px-1">A</kbd> N/A, <kbd className="rounded border border-line px-1">↑</kbd>
          <kbd className="rounded border border-line px-1">↓</kbd> move
        </span>
        <div className="flex gap-2">
          {visit.status !== 'complete' && (
            <button className={`btn ${canComplete(progress) ? 'bg-yes text-on-status hover:bg-yes/90' : 'border border-line bg-surface text-muted'}`} onClick={complete}>
              <CheckCircle2 size={16} /> Mark complete
            </button>
          )}
          <button className="btn-primary" onClick={onNext}>
            Next dealership <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

const yesNoBtn = 'flex h-14 min-w-[84px] items-center justify-center rounded-lg border-2 px-4 font-display text-lg font-bold tracking-wide transition-colors sm:min-w-[96px]';

function QuestionCapture({
  n,
  entry,
  active,
  missing,
  noteOpen,
  onToggleNote,
  onFocus,
  onAnswer,
  onText,
  onComment,
  rowRef,
}: {
  n: NumberedQuestion;
  entry?: ResponseEntry;
  active: boolean;
  missing: boolean;
  noteOpen: boolean;
  onToggleNote: () => void;
  onFocus: () => void;
  onAnswer: (v: ResponseEntry['value']) => void;
  onText: (t: string) => void;
  onComment: (t: string) => void;
  rowRef: (el: HTMLLIElement | null) => void;
}) {
  const { q } = n;
  const value = entry?.value;
  if (q.isGroup)
    return (
      <li className="border-b border-line/60 px-4 pb-1 pt-3 sm:px-5">
        <span className="num mr-2 font-semibold text-muted">{n.label}</span>
        <span className="font-semibold">{q.text}</span>
      </li>
    );

  const yn = (v: 'yes' | 'no' | 'na', text: string) => {
    const on = value === v;
    const cls = on
      ? v === 'yes'
        ? 'border-yes bg-yes text-on-status'
        : v === 'no'
          ? 'border-no bg-no text-on-status'
          : 'border-na bg-na text-on-status'
      : v === 'yes'
        ? 'border-line bg-surface text-yes hover:border-yes hover:bg-yes-soft'
        : v === 'no'
          ? 'border-line bg-surface text-no hover:border-no hover:bg-no-soft'
          : 'border-line bg-surface text-na hover:border-na hover:bg-na-soft';
    return (
      <button type="button" className={`${yesNoBtn} ${cls} ${v === 'na' ? 'min-w-[64px] text-base sm:min-w-[72px]' : ''}`} aria-pressed={on} onClick={() => onAnswer(v)}>
        {text}
      </button>
    );
  };

  return (
    <li ref={rowRef} className={`border-b border-line/60 transition-colors last:border-0 ${active ? 'bg-accent-soft/50' : ''} ${missing ? 'bg-no-soft/40' : ''}`} onClick={onFocus}>
      <div className={`flex flex-col gap-3 py-3 pr-4 sm:flex-row sm:items-center sm:pr-5 ${n.depth ? 'pl-9 sm:pl-12' : 'pl-4 sm:pl-5'}`}>
        <div className="flex min-w-0 flex-1 gap-3">
          <span className={`num w-8 shrink-0 pt-0.5 text-sm font-semibold ${active ? 'text-accent' : 'text-muted'}`}>{n.label}</span>
          <div className="min-w-0">
            <div className="text-[15px] leading-snug">
              {q.text}
              {!q.required && <span className="ml-2 text-xs text-muted">(optional)</span>}
            </div>
            {q.reverse && <div className="mt-0.5 text-xs text-warn">Negative behaviour: No is the compliant answer</div>}
            {q.hint && <div className="mt-0.5 text-xs text-muted">{q.hint}</div>}
            {missing && <div className="mt-0.5 text-xs font-medium text-no">Answer this before completing the visit</div>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
          {(q.type === 'yes_no' || q.type === 'yes_no_na') && (
            <>
              {yn('yes', 'YES')}
              {yn('no', 'NO')}
              {q.type === 'yes_no_na' && yn('na', 'N/A')}
            </>
          )}
          {q.type === 'rating5' &&
            [1, 2, 3, 4, 5].map((r) => (
              <button key={r} type="button" aria-pressed={value === r} className={`flex h-12 w-12 items-center justify-center rounded-lg border-2 font-display text-lg font-bold ${value === r ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface hover:border-accent'}`} onClick={() => onAnswer(r)}>
                {r}
              </button>
            ))}
          {q.type === 'choice' && (
            <div className="flex flex-wrap gap-2">
              {(q.options ?? []).filter(Boolean).map((o) => (
                <button key={o} type="button" aria-pressed={value === o} className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold ${value === o ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface hover:border-accent'}`} onClick={() => onAnswer(o)}>
                  {o}
                </button>
              ))}
            </div>
          )}
          {q.type === 'text' && <textarea className="input min-h-[60px] w-full sm:w-80" defaultValue={typeof value === 'string' ? value : ''} onBlur={(e) => onText(e.target.value)} placeholder="Type the observation" aria-label={q.text} />}
          <button type="button" className={`btn-ghost px-2 ${entry?.comment ? 'text-accent' : ''}`} title="Add a note" aria-label="Add a note" onClick={(e) => (e.stopPropagation(), onToggleNote())}>
            <MessageSquarePlus size={18} />
          </button>
        </div>
      </div>
      {noteOpen && (
        <div className={`pb-3 pr-5 ${n.depth ? 'pl-[5.25rem]' : 'pl-16'}`}>
          <input className="input py-1.5 text-sm" defaultValue={entry?.comment ?? ''} placeholder="Note on this answer (optional)" onBlur={(e) => onComment(e.target.value.trim())} aria-label="Note" />
        </div>
      )}
    </li>
  );
}
