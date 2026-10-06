import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CornerDownRight, IndentDecrease, IndentIncrease, Lock, Plus, Save, Trash2, Heading, BookmarkPlus } from 'lucide-react';
import type { ID, Question, QuestionType, Section } from '../lib/types';
import { QUESTION_TYPE_LABELS } from '../lib/types';
import { isAnswerable, isScored, numberSections } from '../lib/calc';
import { exerciseVersions, saveAsTemplate, saveQuestionnaire, versionUsage } from '../store/actions';
import { useData, uid } from '../store/store';
import { ConfirmButton, Modal, toast } from './ui';

type Block = { parent: Question; children: Question[] };

function toBlocks(qs: Question[]): Block[] {
  const blocks: Block[] = [];
  for (const q of qs) {
    if (q.parentId && blocks.length && blocks[blocks.length - 1].parent.id === q.parentId) blocks[blocks.length - 1].children.push(q);
    else blocks.push({ parent: q.parentId ? { ...q, parentId: undefined } : q, children: [] });
  }
  return blocks;
}
const fromBlocks = (b: Block[]): Question[] => b.flatMap((x) => [x.parent, ...x.children]);

const newQuestion = (extra: Partial<Question> = {}): Question => ({ id: uid(), text: '', type: 'yes_no', required: true, ...extra });

export function QuestionnaireBuilder({ exerciseId }: { exerciseId: ID }) {
  const data = useData();
  const versions = useMemo(() => exerciseVersions(exerciseId), [data.versions, exerciseId]);
  const latest = versions[versions.length - 1];
  const usage = useMemo(() => (latest ? versionUsage(latest.id) : { visits: 0, answered: 0, locked: false }), [latest, data.visits]);
  const [draft, setDraft] = useState<Section[]>(latest?.sections ?? []);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState<ID | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [note, setNote] = useState('');
  const focusId = useRef<ID | null>(null);
  const lastVersionId = useRef(latest?.id);

  // Pick up changes from elsewhere (another device) when there are no local edits.
  useEffect(() => {
    if (!dirty || latest?.id !== lastVersionId.current) {
      setDraft(latest?.sections ?? []);
      if (latest?.id !== lastVersionId.current) setDirty(false);
      lastVersionId.current = latest?.id;
    }
  }, [latest]);

  useEffect(() => {
    if (focusId.current) {
      document.getElementById(`q-${focusId.current}`)?.focus();
      focusId.current = null;
    }
  });

  const numbered = useMemo(() => numberSections(draft), [draft]);
  const labelOf = useMemo(() => new Map(numbered.map((n) => [n.q.id, n.label])), [numbered]);
  const counts = useMemo(() => ({ answerable: numbered.filter((n) => isAnswerable(n.q)).length, scored: numbered.filter((n) => isScored(n.q)).length }), [numbered]);

  const commit = (next: Section[]) => {
    setDraft(next);
    if (usage.locked) setDirty(true);
    else {
      saveQuestionnaire(exerciseId, next);
      setDirty(false);
    }
  };

  const publishVersion = () => {
    const empty = draft.flatMap((s) => s.questions).filter((q) => !q.text.trim());
    if (empty.length) {
      toast(`${empty.length} question${empty.length > 1 ? 's have' : ' has'} no text. Fill them in or delete them first.`, 'err');
      return;
    }
    const v = saveQuestionnaire(exerciseId, draft, note.trim() || undefined);
    lastVersionId.current = v.id;
    setDirty(false);
    setNote('');
    toast(`Saved as version ${v.version}. Visits already captured keep their original questions.`);
  };

  const updSection = (sid: ID, fn: (s: Section) => Section) => commit(draft.map((s) => (s.id === sid ? fn(s) : s)));
  const updBlocks = (sid: ID, fn: (b: Block[]) => Block[]) => updSection(sid, (s) => ({ ...s, questions: fromBlocks(fn(toBlocks(s.questions))) }));
  const updQuestion = (sid: ID, qid: ID, patch: Partial<Question>) => updSection(sid, (s) => ({ ...s, questions: s.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) }));

  const moveSection = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  const addSection = () => {
    const s: Section = { id: uid(), title: `Section ${draft.length + 1}`, questions: [] };
    commit([...draft, s]);
    setTimeout(() => (document.getElementById(`s-${s.id}`) as HTMLInputElement | null)?.select(), 0);
  };

  const addQuestion = (sid: ID, group = false) => {
    const q = newQuestion(group ? { isGroup: true, required: false, text: '' } : {});
    focusId.current = q.id;
    updSection(sid, (s) => ({ ...s, questions: [...s.questions, q] }));
  };

  const addSub = (sid: ID, parentId: ID) => {
    const q = newQuestion({ parentId });
    focusId.current = q.id;
    updBlocks(sid, (bs) => bs.map((b) => (b.parent.id === parentId ? { ...b, children: [...b.children, q] } : b)));
  };

  const moveQuestion = (sid: ID, q: Question, d: -1 | 1) =>
    updBlocks(sid, (bs) => {
      if (q.parentId) {
        return bs.map((b) => {
          if (b.parent.id !== q.parentId) return b;
          const i = b.children.findIndex((c) => c.id === q.id);
          const j = i + d;
          if (j < 0 || j >= b.children.length) return b;
          const ch = [...b.children];
          [ch[i], ch[j]] = [ch[j], ch[i]];
          return { ...b, children: ch };
        });
      }
      const i = bs.findIndex((b) => b.parent.id === q.id);
      const j = i + d;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const indent = (sid: ID, q: Question) =>
    updBlocks(sid, (bs) => {
      const i = bs.findIndex((b) => b.parent.id === q.id);
      if (i <= 0 || bs[i].children.length) return bs;
      const prev = bs[i - 1];
      const moved = { ...q, parentId: prev.parent.id, isGroup: false, required: q.isGroup ? true : q.required };
      return bs.filter((_, k) => k !== i).map((b) => (b === prev ? { ...b, children: [...b.children, moved] } : b));
    });

  const outdent = (sid: ID, q: Question) =>
    updBlocks(sid, (bs) => {
      const i = bs.findIndex((b) => b.parent.id === q.parentId);
      if (i < 0) return bs;
      const b = bs[i];
      const k = b.children.findIndex((c) => c.id === q.id);
      const before = b.children.slice(0, k);
      const after = b.children.slice(k + 1);
      // Questions below the outdented one stay with their original parent.
      const next = [...bs];
      next.splice(i, 1, { ...b, children: [...before, ...after] }, { parent: { ...q, parentId: undefined }, children: [] });
      return next;
    });

  const deleteQuestion = (sid: ID, q: Question) => updSection(sid, (s) => ({ ...s, questions: s.questions.filter((x) => x.id !== q.id && x.parentId !== q.id) }));

  if (!latest) return <p className="text-sm text-muted">This exercise has no questionnaire.</p>;

  return (
    <div className="space-y-4">
      <div className={`card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm ${usage.locked ? 'border-warn/40 bg-warn-soft/50' : ''}`}>
        <span className="font-semibold">
          Version {latest.version}
          {versions.length > 1 && <span className="font-normal text-muted"> of {versions.length}</span>}
        </span>
        <span className="num text-muted">
          {draft.length} sections · {counts.answerable} questions · {counts.scored} scored
        </span>
        {usage.locked ? (
          <span className="flex items-center gap-1.5 text-warn">
            <Lock size={14} /> In use by {usage.answered} visit{usage.answered === 1 ? '' : 's'}. Edits become version {latest.version + 1}; captured visits keep version {latest.version}.
          </span>
        ) : (
          <span className="text-muted">Not used yet. Changes save automatically.</span>
        )}
        <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => setTplOpen(true)}>
          <BookmarkPlus size={14} /> Save as template
        </button>
      </div>

      {dirty && (
        <div className="card sticky top-2 z-10 flex flex-wrap items-center gap-3 border-accent/50 px-4 py-3 shadow-md">
          <span className="text-sm font-semibold">Unsaved questionnaire changes</span>
          <input className="input max-w-xs flex-1 py-1.5" placeholder="What changed? (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Change note" />
          <div className="ml-auto flex gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                setDraft(latest.sections);
                setDirty(false);
              }}
            >
              Discard
            </button>
            <button className="btn-primary" onClick={publishVersion}>
              <Save size={16} /> Save as version {latest.version + 1}
            </button>
          </div>
        </div>
      )}

      {draft.map((section, si) => {
        const blocks = toBlocks(section.questions);
        return (
          <section key={section.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface2/60 px-4 py-2.5">
              <span className="label-caps shrink-0">Section {si + 1}</span>
              <input
                id={`s-${section.id}`}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 font-display text-lg font-semibold hover:border-line focus:border-accent focus:bg-surface focus:outline-none"
                value={section.title}
                onChange={(e) => updSection(section.id, (s) => ({ ...s, title: e.target.value }))}
                aria-label={`Section ${si + 1} title`}
              />
              <div className="flex items-center">
                <button className="btn-ghost px-2" title="Move section up" disabled={si === 0} onClick={() => moveSection(si, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button className="btn-ghost px-2" title="Move section down" disabled={si === draft.length - 1} onClick={() => moveSection(si, 1)}>
                  <ArrowDown size={16} />
                </button>
                <ConfirmButton className="btn-ghost px-2 text-no" confirmText="Delete section?" title="Delete section" onConfirm={() => commit(draft.filter((s) => s.id !== section.id))}>
                  <Trash2 size={16} />
                </ConfirmButton>
              </div>
            </div>

            <ul>
              {blocks.map((b, bi) => (
                <BlockRows
                  key={b.parent.id}
                  block={b}
                  first={bi === 0}
                  last={bi === blocks.length - 1}
                  labelOf={labelOf}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  onChange={(qid, patch) => updQuestion(section.id, qid, patch)}
                  onMove={(q, d) => moveQuestion(section.id, q, d)}
                  onIndent={(q) => indent(section.id, q)}
                  onOutdent={(q) => outdent(section.id, q)}
                  onAddSub={() => addSub(section.id, b.parent.id)}
                  onDelete={(q) => deleteQuestion(section.id, q)}
                  onEnter={() => addQuestion(section.id)}
                />
              ))}
              {blocks.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No questions yet.</li>}
            </ul>
            <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2.5">
              <button className="btn-ghost px-2.5 py-1.5 text-accent" onClick={() => addQuestion(section.id)}>
                <Plus size={16} /> Add question
              </button>
              <button className="btn-ghost px-2.5 py-1.5" onClick={() => addQuestion(section.id, true)} title='A heading such as "Did the salesperson:" with sub-questions under it'>
                <Heading size={16} /> Add heading with sub-questions
              </button>
            </div>
          </section>
        );
      })}

      <button className="btn-secondary w-full border-dashed py-3" onClick={addSection}>
        <Plus size={16} /> Add section
      </button>

      <Modal
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        title="Save as template"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setTplOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!tplName.trim()}
              onClick={() => {
                saveAsTemplate(tplName.trim(), draft);
                setTplOpen(false);
                setTplName('');
                toast('Template saved. Choose it when you create the next exercise.');
              }}
            >
              Save template
            </button>
          </>
        }
      >
        <label className="field-label" htmlFor="tpl-name">
          Template name
        </label>
        <input id="tpl-name" className="input" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Isuzu showroom visit 2027" autoFocus />
      </Modal>
    </div>
  );
}

function BlockRows(props: {
  block: Block;
  first: boolean;
  last: boolean;
  labelOf: Map<ID, string>;
  expanded: ID | null;
  setExpanded: (id: ID | null) => void;
  onChange: (qid: ID, patch: Partial<Question>) => void;
  onMove: (q: Question, d: -1 | 1) => void;
  onIndent: (q: Question) => void;
  onOutdent: (q: Question) => void;
  onAddSub: () => void;
  onDelete: (q: Question) => void;
  onEnter: () => void;
}) {
  const { block } = props;
  return (
    <>
      <QuestionRow {...props} q={block.parent} canUp={!props.first} canDown={!props.last} canIndent={!props.first && block.children.length === 0} hasChildren={block.children.length > 0} />
      {block.children.map((c, i) => (
        <QuestionRow key={c.id} {...props} q={c} canUp={i > 0} canDown={i < block.children.length - 1} canIndent={false} hasChildren={false} />
      ))}
      {(block.parent.isGroup || block.children.length > 0) && (
        <li className="border-b border-line/60 py-1 pl-14">
          <button className="btn-ghost px-2 py-1 text-xs text-accent" onClick={props.onAddSub}>
            <CornerDownRight size={14} /> Add sub-question to {props.labelOf.get(block.parent.id)}
          </button>
        </li>
      )}
    </>
  );
}

function QuestionRow({
  q,
  labelOf,
  expanded,
  setExpanded,
  onChange,
  onMove,
  onIndent,
  onOutdent,
  onAddSub,
  onDelete,
  onEnter,
  canUp,
  canDown,
  canIndent,
  hasChildren,
}: {
  q: Question;
  labelOf: Map<ID, string>;
  expanded: ID | null;
  setExpanded: (id: ID | null) => void;
  onChange: (qid: ID, patch: Partial<Question>) => void;
  onMove: (q: Question, d: -1 | 1) => void;
  onIndent: (q: Question) => void;
  onOutdent: (q: Question) => void;
  onAddSub: () => void;
  onDelete: (q: Question) => void;
  onEnter: () => void;
  canUp: boolean;
  canDown: boolean;
  canIndent: boolean;
  hasChildren: boolean;
}) {
  const open = expanded === q.id;
  const isSub = !!q.parentId;
  return (
    <li className={`border-b border-line/60 ${q.isGroup ? 'bg-surface2/30' : ''}`}>
      <div className={`flex items-start gap-2 py-2 pr-2 ${isSub ? 'pl-10' : 'pl-3'}`}>
        <button className="btn-ghost mt-0.5 px-1 py-1" onClick={() => setExpanded(open ? null : q.id)} aria-label="Question settings" aria-expanded={open}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <span className="num mt-2 w-8 shrink-0 text-right text-sm font-semibold text-muted">{labelOf.get(q.id)}</span>
        <div className="min-w-0 flex-1">
          <input
            id={`q-${q.id}`}
            className={`input border-transparent bg-transparent hover:border-line focus:bg-surface ${q.isGroup ? 'font-semibold' : ''}`}
            value={q.text}
            placeholder={q.isGroup ? 'Heading, e.g. "Did the salesperson:"' : 'Type the question'}
            onChange={(e) => onChange(q.id, { text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSub) {
                e.preventDefault();
                onEnter();
              }
            }}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 pl-1 text-xs text-muted">
            {q.isGroup ? (
              <span>Heading only (not answered)</span>
            ) : (
              <>
                <span>{QUESTION_TYPE_LABELS[q.type]}</span>
                {!q.required && <span className="rounded bg-surface2 px-1.5 py-0.5">Optional</span>}
                {q.reverse && <span className="rounded bg-warn-soft px-1.5 py-0.5 font-medium text-warn">Negative behaviour: No is compliant</span>}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <button className="btn-ghost px-1.5" title="Move up" disabled={!canUp} onClick={() => onMove(q, -1)}>
            <ArrowUp size={15} />
          </button>
          <button className="btn-ghost px-1.5" title="Move down" disabled={!canDown} onClick={() => onMove(q, 1)}>
            <ArrowDown size={15} />
          </button>
          {isSub ? (
            <button className="btn-ghost px-1.5" title="Make it a main question" onClick={() => onOutdent(q)}>
              <IndentDecrease size={15} />
            </button>
          ) : (
            <button className="btn-ghost px-1.5" title="Make it a sub-question of the question above" disabled={!canIndent} onClick={() => onIndent(q)}>
              <IndentIncrease size={15} />
            </button>
          )}
          <ConfirmButton className="btn-ghost px-1.5 text-no" confirmText={hasChildren ? 'Delete with subs?' : 'Delete?'} title="Delete question" onConfirm={() => onDelete(q)}>
            <Trash2 size={15} />
          </ConfirmButton>
        </div>
      </div>
      {open && (
        <div className={`grid gap-3 border-t border-line/60 bg-surface2/40 py-3 pr-4 sm:grid-cols-2 lg:grid-cols-4 ${isSub ? 'pl-[5.5rem]' : 'pl-[3.75rem]'}`}>
          {!q.isGroup && (
            <>
              <div>
                <label className="field-label" htmlFor={`qt-${q.id}`}>
                  Response type
                </label>
                <select id={`qt-${q.id}`} className="input py-1.5" value={q.type} onChange={(e) => onChange(q.id, { type: e.target.value as QuestionType })}>
                  {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm sm:mt-5">
                <input type="checkbox" checked={q.required} onChange={(e) => onChange(q.id, { required: e.target.checked })} /> Required to complete a visit
              </label>
              {(q.type === 'yes_no' || q.type === 'yes_no_na') && (
                <label className="flex items-start gap-2 text-sm sm:mt-5">
                  <input type="checkbox" className="mt-0.5" checked={!!q.reverse} onChange={(e) => onChange(q.id, { reverse: e.target.checked })} />
                  <span>
                    Negative behaviour
                    <span className="block text-xs text-muted">No counts as compliant, e.g. "Did they say 'Can I help you?'"</span>
                  </span>
                </label>
              )}
              {q.type === 'choice' && (
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor={`qo-${q.id}`}>
                    Options (one per line)
                  </label>
                  <textarea id={`qo-${q.id}`} className="input min-h-[80px] py-1.5" value={(q.options ?? []).join('\n')} onChange={(e) => onChange(q.id, { options: e.target.value.split('\n') })} />
                </div>
              )}
            </>
          )}
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor={`qh-${q.id}`}>
              Guidance for the shopper
            </label>
            <input id={`qh-${q.id}`} className="input py-1.5" value={q.hint ?? ''} placeholder="Optional" onChange={(e) => onChange(q.id, { hint: e.target.value || undefined })} />
          </div>
          {!isSub && !q.isGroup && (
            <div className="sm:col-span-2 lg:col-span-4">
              <button className="btn-ghost px-2 py-1 text-xs text-accent" onClick={onAddSub}>
                <CornerDownRight size={14} /> Add a sub-question under this question
              </button>
            </div>
          )}
          {(q.type === 'rating5' || q.type === 'choice' || q.type === 'text') && !q.isGroup && <p className="text-xs text-muted sm:col-span-2 lg:col-span-4">This response type is captured and reported, but it does not change compliance percentages.</p>}
        </div>
      )}
    </li>
  );
}
