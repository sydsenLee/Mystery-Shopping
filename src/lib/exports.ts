// Excel, CSV and PDF exports. All figures come from the same ExerciseReport
// that the screens use, so exported numbers always match the app.

import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData, type RowInput } from 'jspdf-autotable';
import { compliantValue, visitOutcome, type Tally } from './calc';
import { periodLabel, type ExerciseReport, type QuestionRow } from './report';
import { saveFile, safeFileName } from './download';
import { getUi } from '../store/ui';

const C = {
  yes: '168047',
  yesSoft: 'D6F0DF',
  no: 'C42B34',
  noSoft: 'FADFE1',
  na: '667587',
  naSoft: 'E4E9EF',
  warn: 'A66800',
  warnSoft: 'FCEED0',
  ink: '111C29',
  muted: '586575',
  line: 'D6DCE4',
  head: '1C58B2',
  band: 'ECF0F4',
};

const pctText = (p: number | null) => (p === null ? '-' : `${p.toFixed(0)}%`);
const frac = (p: number | null) => (p === null ? null : Math.round(p * 10) / 1000);

function bandOf(p: number | null) {
  const t = getUi().thresholds;
  if (p === null) return 'none';
  return p >= t.good ? 'good' : p >= t.fair ? 'fair' : 'poor';
}
function bandColors(p: number | null): { fg: string; bg: string } {
  const b = bandOf(p);
  if (b === 'good') return { fg: C.yes, bg: C.yesSoft };
  if (b === 'fair') return { fg: C.warn, bg: C.warnSoft };
  if (b === 'poor') return { fg: C.no, bg: C.noSoft };
  return { fg: C.muted, bg: 'FFFFFF' };
}

function filterSummary(r: ExerciseReport): string {
  const f = r.filters;
  const parts: string[] = [];
  if (f.dealershipIds?.length) parts.push(`${f.dealershipIds.length} dealership(s)`);
  if (f.regions?.length) parts.push(`region: ${f.regions.join(', ')}`);
  if (f.dateFrom || f.dateTo) parts.push(`visits ${f.dateFrom || '...'} to ${f.dateTo || '...'}`);
  if (f.sectionIds?.length) parts.push(`${f.sectionIds.length} section(s)`);
  if (f.questionIds?.length) parts.push(`${f.questionIds.length} question(s)`);
  parts.push(f.includeInProgress ? 'includes visits in progress' : 'completed visits only');
  return parts.join('; ');
}

const METHOD =
  'Compliance % = answers that meet the standard ÷ (Yes + No answers) × 100. N/A and unanswered questions are excluded from the denominator and never counted as No. ' +
  'For negative-behaviour questions a No answer meets the standard. Section and overall figures pool all valid answers.';

function baseName(r: ExerciseReport) {
  return safeFileName(`${r.oem?.name ?? ''} ${r.exercise.name}`);
}

// ---------------------------------------------------------------------------
// Excel

export async function exportExcel(r: ExerciseReport, opts: { bloodChartOnly?: boolean } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mystery Shop';
  wb.created = new Date();

  if (!opts.bloodChartOnly) summarySheet(wb, r);
  bloodChartSheet(wb, r);
  if (!opts.bloodChartOnly) {
    questionSheet(wb, r);
    dealerSheet(wb, r);
    responsesSheet(wb, r);
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return saveFile(`${baseName(r)}${opts.bloodChartOnly ? '_Blood_Chart' : '_Results'}.xlsx`, blob);
}

function fillCell(cell: ExcelJS.Cell, bg: string, fg?: string, bold = false) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
  cell.font = { ...(cell.font ?? {}), color: fg ? { argb: 'FF' + fg } : undefined, bold };
}
const thin = { style: 'thin' as const, color: { argb: 'FF' + C.line } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function pctCell(cell: ExcelJS.Cell, p: number | null) {
  cell.value = frac(p);
  cell.numFmt = '0%';
  cell.alignment = { horizontal: 'center' };
  const { fg, bg } = bandColors(p);
  if (p !== null) fillCell(cell, bg, fg, true);
}

function headerRow(row: ExcelJS.Row) {
  row.eachCell((c) => {
    fillCell(c, C.head, 'FFFFFF', true);
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = border;
  });
}

function summarySheet(wb: ExcelJS.Workbook, r: ExerciseReport) {
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 34 }, { width: 60 }, { width: 14 }, { width: 14 }];
  let row = 1;
  if (r.oem?.logo) {
    try {
      const ext = r.oem.logo.startsWith('data:image/png') ? 'png' : 'jpeg';
      const id = wb.addImage({ base64: r.oem.logo, extension: ext });
      ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 48 } });
      ws.getRow(1).height = 40;
      row = 3;
    } catch {
      /* skip logo */
    }
  }
  const title = ws.getCell(`A${row}`);
  title.value = `${r.oem?.name ?? ''} Mystery Shopping Results`;
  title.font = { size: 18, bold: true, color: { argb: 'FF' + C.ink } };
  row += 2;
  const info: [string, string | number][] = [
    ['OEM', r.oem?.name ?? ''],
    ['Exercise', r.exercise.name],
    ['Assessment period', periodLabel(r.exercise)],
    ['Region', r.exercise.region ?? ''],
    ['Dealership visits included', r.visits.length],
    ['Dealerships', r.dealerRows.length],
    ['Filters', filterSummary(r)],
    ['Generated', new Date().toLocaleString('en-ZA')],
  ];
  for (const [k, v] of info) {
    ws.getCell(`A${row}`).value = k;
    ws.getCell(`A${row}`).font = { bold: true, color: { argb: 'FF' + C.muted } };
    ws.getCell(`B${row}`).value = v;
    row++;
  }
  row++;
  const h = ws.getRow(row);
  h.values = ['Result', '', 'Score', 'Valid answers'];
  headerRow(h);
  row++;
  const add = (label: string, t: Tally, bold = false) => {
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font = { bold };
    pctCell(ws.getCell(`C${row}`), t.pct);
    ws.getCell(`D${row}`).value = t.valid;
    row++;
  };
  add('Overall compliance', r.overall, true);
  for (const s of r.sections) add(`${s.index + 1}. ${s.section.title}`, s.tally);
  if (r.best) {
    ws.getCell(`A${row}`).value = 'Highest scoring visit';
    ws.getCell(`B${row}`).value = r.best.label;
    pctCell(ws.getCell(`C${row}`), r.best.tally.pct);
    row++;
  }
  if (r.worst) {
    ws.getCell(`A${row}`).value = 'Lowest scoring visit';
    ws.getCell(`B${row}`).value = r.worst.label;
    pctCell(ws.getCell(`C${row}`), r.worst.tally.pct);
    row++;
  }
  const list = (title: string, qs: QuestionRow[]) => {
    row++;
    const hr = ws.getRow(row);
    hr.values = [title, 'Question', 'Compliance', 'Yes / Valid'];
    headerRow(hr);
    row++;
    for (const q of qs) {
      ws.getCell(`A${row}`).value = q.nq.code;
      ws.getCell(`B${row}`).value = q.nq.q.text;
      ws.getCell(`B${row}`).alignment = { wrapText: true };
      pctCell(ws.getCell(`C${row}`), q.tally.pct);
      ws.getCell(`D${row}`).value = `${q.tally.compliant} / ${q.tally.valid}`;
      row++;
    }
  };
  list('Key strengths', r.strengths);
  list('Key areas requiring improvement', r.gaps);
  row++;
  ws.getCell(`A${row}`).value = 'How results are calculated';
  ws.getCell(`A${row}`).font = { bold: true };
  ws.mergeCells(`B${row}:D${row + 2}`);
  ws.getCell(`B${row}`).value = METHOD;
  ws.getCell(`B${row}`).alignment = { wrapText: true, vertical: 'top' };
}

function bloodChartSheet(wb: ExcelJS.Workbook, r: ExerciseReport) {
  const ws = wb.addWorksheet('Blood Chart', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] });
  const cols = r.visitRows;
  const last = cols.length + 3;
  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 58;
  for (let i = 0; i < cols.length; i++) ws.getColumn(i + 3).width = 6.5;
  ws.getColumn(last).width = 13;

  ws.getCell('A1').value = `${r.oem?.name ?? ''} | ${r.exercise.name} | ${periodLabel(r.exercise)}`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = filterSummary(r);
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF' + C.muted } };

  const teamRow = ws.getRow(3);
  const nameRow = ws.getRow(4);
  nameRow.height = 130;
  ws.getCell('A4').value = 'No.';
  ws.getCell('B4').value = 'Question';
  cols.forEach((c, i) => {
    teamRow.getCell(i + 3).value = c.visit.team ?? i + 1;
    teamRow.getCell(i + 3).alignment = { horizontal: 'center' };
    teamRow.getCell(i + 3).font = { size: 9, color: { argb: 'FF' + C.muted } };
    nameRow.getCell(i + 3).value = c.label;
  });
  nameRow.getCell(last).value = 'Compliance %';
  headerRow(nameRow);
  nameRow.eachCell((cell, n) => {
    if (n >= 3 && n < last) cell.alignment = { textRotation: 90, vertical: 'bottom', horizontal: 'center' };
  });

  let rowN = 5;
  for (const s of r.sections) {
    const row = ws.getRow(rowN++);
    row.getCell(1).value = s.index + 1;
    row.getCell(2).value = s.section.title.toUpperCase();
    for (let c = 1; c <= last; c++) fillCell(row.getCell(c), C.band, C.ink, true);
    cols.forEach((c, i) => {
      pctCell(row.getCell(i + 3), c.sections.get(s.section.id)?.pct ?? null);
      row.getCell(i + 3).font = { size: 8, bold: true, color: { argb: 'FF' + bandColors(c.sections.get(s.section.id)?.pct ?? null).fg } };
    });
    pctCell(row.getCell(last), s.tally.pct);
    for (const q of r.questions.filter((x) => x.nq.section.id === s.section.id)) {
      const qr = ws.getRow(rowN++);
      qr.getCell(1).value = q.nq.label;
      qr.getCell(1).alignment = { horizontal: q.nq.depth ? 'right' : 'left' };
      qr.getCell(2).value = (q.nq.depth ? '    ' : '') + q.nq.q.text + (q.nq.q.reverse ? ' (negative behaviour: No is compliant)' : '');
      qr.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
      if (q.nq.q.isGroup) qr.getCell(2).font = { bold: true };
      cols.forEach((c, i) => {
        const cell = qr.getCell(i + 3);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = border;
        if (q.nq.q.isGroup) return;
        if (!q.scored) {
          const e = c.visit.responses[q.nq.q.id];
          cell.value = e ? (typeof e.value === 'number' ? e.value : String(e.value)) : '';
          return;
        }
        const o = visitOutcome(r.ctx, c.visit, q.nq.q);
        if (o === 'yes' || o === 'no') {
          const ok = compliantValue(q.nq.q) === o;
          cell.value = o === 'yes' ? 'Yes' : 'No';
          fillCell(cell, ok ? C.yes : C.no, 'FFFFFF', true);
        } else if (o === 'na') {
          cell.value = 'N/A';
          fillCell(cell, C.naSoft, C.na);
        } else if (o === 'not_applicable_version') {
          cell.value = '-';
          cell.font = { color: { argb: 'FF' + C.muted } };
        }
        const note = c.visit.responses[q.nq.q.id]?.comment;
        if (note) cell.note = note;
        cell.font = { ...(cell.font ?? {}), size: 9 };
      });
      if (q.scored) {
        pctCell(qr.getCell(last), q.tally.pct);
      } else if (q.rating?.avg != null) qr.getCell(last).value = `avg ${q.rating.avg.toFixed(1)}/5`;
    }
  }
  const tr = ws.getRow(rowN + 1);
  tr.getCell(2).value = 'OVERALL SCORE PER VISIT';
  tr.getCell(2).font = { bold: true };
  cols.forEach((c, i) => {
    pctCell(tr.getCell(i + 3), c.tally.pct);
    tr.getCell(i + 3).font = { size: 8, bold: true, color: { argb: 'FF' + bandColors(c.tally.pct).fg } };
  });
  pctCell(tr.getCell(last), r.overall.pct);

  const lg = ws.getRow(rowN + 3);
  lg.getCell(2).value = 'Green = meets the standard, red = does not. N/A and blank cells are excluded from percentages. "-" = question not in the questionnaire version used for that visit.';
  lg.getCell(2).font = { italic: true, size: 9, color: { argb: 'FF' + C.muted } };
}

function questionSheet(wb: ExcelJS.Workbook, r: ExerciseReport) {
  const ws = wb.addWorksheet('Question Compliance', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'No.', width: 8 },
    { header: 'Section', width: 26 },
    { header: 'Question', width: 60 },
    { header: 'Negative behaviour', width: 11 },
    { header: 'Yes', width: 8 },
    { header: 'No', width: 8 },
    { header: 'N/A', width: 8 },
    { header: 'Not answered', width: 10 },
    { header: 'Valid (Yes + No)', width: 10 },
    { header: 'Meets standard', width: 10 },
    { header: 'Compliance %', width: 13 },
  ];
  headerRow(ws.getRow(1));
  for (const q of r.questions.filter((x) => x.scored)) {
    const row = ws.addRow([q.nq.code, q.nq.section.title, q.nq.q.text, q.nq.q.reverse ? 'Yes' : '', q.tally.yes, q.tally.no, q.tally.na, q.tally.unanswered, q.tally.valid, q.tally.compliant, null]);
    row.getCell(3).alignment = { wrapText: true };
    pctCell(row.getCell(11), q.tally.pct);
  }
  ws.autoFilter = { from: 'A1', to: 'K1' };
}

function dealerSheet(wb: ExcelJS.Workbook, r: ExerciseReport) {
  const ws = wb.addWorksheet('Dealership Results', { views: [{ state: 'frozen', ySplit: 1 }] });
  const secCols = r.sections.map((s) => ({ header: s.section.title, width: 14 }));
  ws.columns = [{ header: 'Rank', width: 7 }, { header: 'Dealership', width: 32 }, { header: 'Team', width: 10 }, { header: 'Visit date', width: 12 }, { header: 'Region', width: 14 }, { header: 'Status', width: 12 }, ...secCols, { header: 'Overall %', width: 12 }, { header: 'Valid answers', width: 10 }];
  headerRow(ws.getRow(1));
  const sorted = [...r.visitRows].sort((a, b) => (b.tally.pct ?? -1) - (a.tally.pct ?? -1));
  sorted.forEach((v, i) => {
    const row = ws.addRow([i + 1, v.label, v.visit.team ?? '', v.visit.visitDate ?? '', v.dealership?.region ?? '', v.visit.status === 'complete' ? 'Complete' : 'In progress']);
    r.sections.forEach((s, k) => pctCell(row.getCell(7 + k), v.sections.get(s.section.id)?.pct ?? null));
    pctCell(row.getCell(7 + r.sections.length), v.tally.pct);
    row.getCell(8 + r.sections.length).value = v.tally.valid;
  });

  const ws2 = wb.addWorksheet('By Dealership');
  ws2.columns = [{ header: 'Dealership', width: 32 }, { header: 'Visits', width: 8 }, ...secCols, { header: 'Overall %', width: 12 }];
  headerRow(ws2.getRow(1));
  for (const d of r.dealerRows) {
    const row = ws2.addRow([d.name, d.visits.length]);
    r.sections.forEach((s, k) => pctCell(row.getCell(3 + k), d.sections.get(s.section.id)?.pct ?? null));
    pctCell(row.getCell(3 + r.sections.length), d.tally.pct);
  }
}

function responsesSheet(wb: ExcelJS.Workbook, r: ExerciseReport) {
  const ws = wb.addWorksheet('All Responses', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Dealership', width: 28 },
    { header: 'Team', width: 10 },
    { header: 'Visit date', width: 12 },
    { header: 'Status', width: 12 },
    { header: 'No.', width: 8 },
    { header: 'Section', width: 24 },
    { header: 'Question', width: 56 },
    { header: 'Answer', width: 10 },
    { header: 'Meets standard', width: 10 },
    { header: 'Note', width: 40 },
  ];
  headerRow(ws.getRow(1));
  for (const row of responseRows(r)) ws.addRow(row);
  ws.autoFilter = { from: 'A1', to: 'J1' };
}

function responseRows(r: ExerciseReport): (string | number)[][] {
  const out: (string | number)[][] = [];
  for (const v of r.visitRows) {
    for (const q of r.questions) {
      if (q.nq.q.isGroup) continue;
      const o = visitOutcome(r.ctx, v.visit, q.nq.q);
      if (o === 'not_applicable_version') continue;
      const e = v.visit.responses[q.nq.q.id];
      const answer = o === 'yes' ? 'Yes' : o === 'no' ? 'No' : o === 'na' ? 'N/A' : o === 'unanswered' ? '' : e ? String(e.value) : '';
      const meets = o === 'yes' || o === 'no' ? (compliantValue(q.nq.q) === o ? 'Yes' : 'No') : '';
      out.push([v.label, v.visit.team ?? '', v.visit.visitDate ?? '', v.visit.status === 'complete' ? 'Complete' : 'In progress', q.nq.code, q.nq.section.title, q.nq.q.text, answer, meets, e?.comment ?? '']);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CSV

function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export type CsvKind = 'blood-chart' | 'questions' | 'dealers' | 'responses';

export function exportCsv(r: ExerciseReport, kind: CsvKind) {
  let rows: (string | number | null)[][] = [];
  const p = (x: number | null) => (x === null ? '' : x.toFixed(1));
  if (kind === 'blood-chart') {
    rows.push(['No.', 'Question', ...r.visitRows.map((v) => v.label), 'Compliance %']);
    rows.push(['', 'Team', ...r.visitRows.map((v) => v.visit.team ?? ''), '']);
    for (const s of r.sections) {
      rows.push([String(s.index + 1), s.section.title.toUpperCase(), ...r.visitRows.map((v) => p(v.sections.get(s.section.id)?.pct ?? null)), p(s.tally.pct)]);
      for (const q of r.questions.filter((x) => x.nq.section.id === s.section.id)) {
        rows.push([
          q.nq.code,
          q.nq.q.text,
          ...r.visitRows.map((v) => {
            if (q.nq.q.isGroup) return '';
            const o = visitOutcome(r.ctx, v.visit, q.nq.q);
            return o === 'yes' ? 'Y' : o === 'no' ? 'N' : o === 'na' ? 'N/A' : o === 'not_applicable_version' ? '-' : '';
          }),
          q.scored ? p(q.tally.pct) : '',
        ]);
      }
    }
    rows.push(['', 'OVERALL', ...r.visitRows.map((v) => p(v.tally.pct)), p(r.overall.pct)]);
  } else if (kind === 'questions') {
    rows.push(['No.', 'Section', 'Question', 'Negative behaviour', 'Yes', 'No', 'N/A', 'Not answered', 'Valid', 'Meets standard', 'Compliance %']);
    for (const q of r.questions.filter((x) => x.scored)) rows.push([q.nq.code, q.nq.section.title, q.nq.q.text, q.nq.q.reverse ? 'Yes' : '', q.tally.yes, q.tally.no, q.tally.na, q.tally.unanswered, q.tally.valid, q.tally.compliant, p(q.tally.pct)]);
  } else if (kind === 'dealers') {
    rows.push(['Dealership', 'Team', 'Visit date', 'Region', 'Status', ...r.sections.map((s) => `${s.section.title} %`), 'Overall %', 'Valid answers']);
    for (const v of r.visitRows) rows.push([v.label, v.visit.team ?? '', v.visit.visitDate ?? '', v.dealership?.region ?? '', v.visit.status, ...r.sections.map((s) => p(v.sections.get(s.section.id)?.pct ?? null)), p(v.tally.pct), v.tally.valid]);
  } else {
    rows = [['Dealership', 'Team', 'Visit date', 'Status', 'No.', 'Section', 'Question', 'Answer', 'Meets standard', 'Note'], ...responseRows(r)];
  }
  const names: Record<CsvKind, string> = { 'blood-chart': 'Blood_Chart', questions: 'Question_Compliance', dealers: 'Dealership_Results', responses: 'All_Responses' };
  return saveFile(`${baseName(r)}_${names[kind]}.csv`, toCsv(rows));
}

// ---------------------------------------------------------------------------
// PDF

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];

export async function exportPdf(r: ExerciseReport, opts: { includeBloodChart: boolean; includeResponses?: boolean }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const brand = (r.oem?.color ?? '#1C58B2').replace('#', '').toUpperCase().padEnd(6, '0');
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  let y = M;

  // Header band
  doc.setFillColor(...rgb(brand));
  doc.rect(0, 0, W, 4, 'F');
  if (r.oem?.logo) {
    try {
      const props = doc.getImageProperties(r.oem.logo);
      const h = 16;
      const w = Math.min(50, (props.width / props.height) * h);
      doc.addImage(r.oem.logo, M, 10, w, h);
      y = 30;
    } catch {
      y = 14;
    }
  } else y = 14;
  doc.setTextColor(...rgb(C.muted));
  doc.setFontSize(9);
  doc.text('MYSTERY SHOPPING REPORT', M, y);
  y += 7;
  doc.setTextColor(...rgb(C.ink));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(`${r.oem?.name ?? ''}: ${r.exercise.name}`, W - 2 * M);
  doc.text(titleLines, M, y);
  y += titleLines.length * 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...rgb(C.muted));
  doc.text([`Assessment period: ${periodLabel(r.exercise)}${r.exercise.region ? '   |   Region: ' + r.exercise.region : ''}`, `Scope: ${filterSummary(r)}   |   Generated ${new Date().toLocaleDateString('en-ZA')}`], M, y);
  y += 14;

  // KPI tiles
  const tiles: [string, string, number | null][] = [
    ['Dealership visits', String(r.visits.length), null],
    ['Overall compliance', pctText(r.overall.pct), r.overall.pct],
    ...r.sections.slice(0, 2).map((s) => [s.section.title, pctText(s.tally.pct), s.tally.pct] as [string, string, number | null]),
  ];
  const tw = (W - 2 * M - (tiles.length - 1) * 4) / tiles.length;
  tiles.forEach(([label, value, p], i) => {
    const x = M + i * (tw + 4);
    doc.setDrawColor(...rgb(C.line));
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, tw, 22, 2, 2, 'FD');
    doc.setFontSize(7);
    doc.setTextColor(...rgb(C.muted));
    doc.text(doc.splitTextToSize(label.toUpperCase(), tw - 6).slice(0, 2), x + 3, y + 5.5);
    doc.setFontSize(17);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb(p === null ? C.ink : bandColors(p).fg));
    doc.text(value, x + 3, y + 18.5);
    doc.setFont('helvetica', 'normal');
  });
  y += 30;

  const pctCellHook = (col: number) => (d: CellHookData) => {
    if (d.section !== 'body' || d.column.index !== col) return;
    const raw = (d.cell.raw as { p?: number | null })?.p;
    if (raw === undefined) return;
    const { fg, bg } = bandColors(raw);
    d.cell.styles.fillColor = rgb(bg);
    d.cell.styles.textColor = rgb(fg);
    d.cell.styles.fontStyle = 'bold';
  };
  const pc = (p: number | null) => ({ content: pctText(p), p, styles: { halign: 'center' as const } });
  const heading = (text: string) => {
    if (y > 260) {
      doc.addPage();
      y = M;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...rgb(C.ink));
    doc.text(text, M, y);
    doc.setFont('helvetica', 'normal');
    y += 3;
  };
  const tableBase = {
    margin: { left: M, right: M },
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: rgb(C.ink), lineColor: rgb(C.line), lineWidth: 0.1 },
    headStyles: { fillColor: rgb(brand), textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [248, 249, 251] as [number, number, number] },
  };
  const after = () => ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? y) + 9;

  heading('Section results');
  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [['Section', 'Valid answers', 'Meets standard', 'Compliance']],
    body: [...r.sections.map((s) => [`${s.index + 1}. ${s.section.title}`, s.tally.valid, s.tally.compliant, pc(s.tally.pct)]), [{ content: 'Overall', styles: { fontStyle: 'bold' } }, r.overall.valid, r.overall.compliant, pc(r.overall.pct)]] as RowInput[],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { cellWidth: 26 } },
    didParseCell: pctCellHook(3),
  });
  y = after();

  const qTable = (title: string, rows: QuestionRow[], empty: string) => {
    heading(title);
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [['No.', 'Question', 'Yes / valid', 'Compliance']],
      body: rows.length ? (rows.map((q) => [q.nq.code, q.nq.q.text, `${q.tally.compliant} / ${q.tally.valid}`, pc(q.tally.pct)]) as RowInput[]) : [[{ content: empty, colSpan: 4 }]],
      columnStyles: { 0: { cellWidth: 13 }, 2: { cellWidth: 22, halign: 'right' }, 3: { cellWidth: 24 } },
      didParseCell: pctCellHook(3),
    });
    y = after();
  };
  qTable('Key strengths', r.strengths, 'No completed results yet.');
  qTable('Key areas requiring improvement', r.gaps, 'No completed results yet.');
  if (r.perfect.length) {
    heading(`Questions with 100% compliance (${r.perfect.length})`);
    autoTable(doc, { ...tableBase, startY: y, head: [['No.', 'Question']], body: r.perfect.map((q) => [q.nq.code, q.nq.q.text]), columnStyles: { 0: { cellWidth: 13 } } });
    y = after();
  }

  heading('Dealership results');
  const dealerSorted = [...r.visitRows].sort((a, b) => (b.tally.pct ?? -1) - (a.tally.pct ?? -1));
  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [['#', 'Dealership', 'Team', ...r.sections.map((s) => s.section.title), 'Overall']],
    body: dealerSorted.map((v, i) => [i + 1, v.label, v.visit.team ?? '', ...r.sections.map((s) => pc(v.sections.get(s.section.id)?.pct ?? null)), pc(v.tally.pct)]) as RowInput[],
    columnStyles: { 0: { cellWidth: 8 } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index >= 3) pctCellHook(d.column.index)(d);
    },
  });
  y = after();

  heading('Question compliance');
  const qBody: RowInput[] = [];
  for (const s of r.sections) {
    qBody.push([{ content: `${s.index + 1}. ${s.section.title}`, colSpan: 6, styles: { fontStyle: 'bold', fillColor: rgb(C.band) } }, pc(s.tally.pct)] as RowInput);
    for (const q of r.questions.filter((x) => x.nq.section.id === s.section.id)) {
      if (q.nq.q.isGroup) {
        qBody.push([q.nq.code, { content: q.nq.q.text, colSpan: 6, styles: { fontStyle: 'bold' } }] as RowInput);
        continue;
      }
      if (!q.scored) continue;
      qBody.push([q.nq.code, (q.nq.depth ? '   ' : '') + q.nq.q.text + (q.nq.q.reverse ? ' (No is compliant)' : ''), q.tally.yes, q.tally.no, q.tally.na, q.tally.unanswered, pc(q.tally.pct)] as RowInput);
    }
  }
  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [['No.', 'Question', 'Yes', 'No', 'N/A', 'Blank', 'Compliance']],
    body: qBody,
    columnStyles: { 0: { cellWidth: 13 }, 2: { cellWidth: 11, halign: 'right' }, 3: { cellWidth: 11, halign: 'right' }, 4: { cellWidth: 11, halign: 'right' }, 5: { cellWidth: 12, halign: 'right' }, 6: { cellWidth: 23 } },
    didParseCell: pctCellHook(6),
  });
  y = after();

  heading('How results are calculated');
  doc.setFontSize(9);
  doc.setTextColor(...rgb(C.muted));
  doc.text(doc.splitTextToSize(METHOD, W - 2 * M), M, y + 3);

  if (opts.includeBloodChart) pdfBloodChart(doc, r, brand);

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(...rgb(C.muted));
    doc.text(`${r.oem?.name ?? ''} | ${r.exercise.name}`, M, ph - 7);
    doc.text(`Page ${i} of ${pages}`, pw - M, ph - 7, { align: 'right' });
  }

  return saveFile(`${baseName(r)}_Report.pdf`, doc.output('blob'));
}

function pdfBloodChart(doc: jsPDF, r: ExerciseReport, brand: string) {
  const PER_PAGE = 20;
  const cols = r.visitRows;
  const chunks = Math.max(1, Math.ceil(cols.length / PER_PAGE));
  for (let k = 0; k < chunks; k++) {
    const slice = cols.slice(k * PER_PAGE, (k + 1) * PER_PAGE);
    doc.addPage('a4', 'landscape');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...rgb(C.ink));
    doc.text(`Blood Chart${chunks > 1 ? ` (dealers ${k * PER_PAGE + 1} to ${k * PER_PAGE + slice.length} of ${cols.length})` : ''}`, 10, 12);
    doc.setFont('helvetica', 'normal');
    const body: RowInput[] = [];
    const meta: ({ kind: 'section' } | { kind: 'q'; q: QuestionRow } | { kind: 'total' })[] = [];
    for (const s of r.sections) {
      body.push([{ content: `${s.index + 1}. ${s.section.title}`, styles: { fontStyle: 'bold' } }, ...slice.map((c) => pctText(c.sections.get(s.section.id)?.pct ?? null)), pctText(s.tally.pct)]);
      meta.push({ kind: 'section' });
      for (const q of r.questions.filter((x) => x.nq.section.id === s.section.id)) {
        if (!q.scored && !q.nq.q.isGroup) continue;
        body.push([
          `${q.nq.label}  ${q.nq.q.text}`,
          ...slice.map((c) => {
            if (q.nq.q.isGroup) return '';
            const o = visitOutcome(r.ctx, c.visit, q.nq.q);
            return o === 'yes' ? 'Y' : o === 'no' ? 'N' : o === 'na' ? 'N/A' : o === 'not_applicable_version' ? '-' : '';
          }),
          q.nq.q.isGroup ? '' : pctText(q.tally.pct),
        ]);
        meta.push({ kind: 'q', q });
      }
    }
    body.push([{ content: 'Overall score per visit', styles: { fontStyle: 'bold' } }, ...slice.map((c) => pctText(c.tally.pct)), pctText(r.overall.pct)]);
    meta.push({ kind: 'total' });

    autoTable(doc, {
      startY: 16,
      margin: { left: 10, right: 10 },
      head: [['Question', ...slice.map((c) => c.label), 'Compliance']],
      body,
      styles: { fontSize: 6.5, cellPadding: 0.9, lineColor: rgb(C.line), lineWidth: 0.1, textColor: rgb(C.ink), halign: 'center', valign: 'middle' },
      headStyles: { fillColor: rgb(brand), textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6, minCellHeight: 30, valign: 'bottom' },
      columnStyles: { 0: { cellWidth: 82, halign: 'left' }, [slice.length + 1]: { cellWidth: 16 } },
      didParseCell: (d) => {
        if (d.section === 'head' && d.column.index > 0 && d.column.index <= slice.length) d.cell.text = [];
        if (d.section !== 'body') return;
        const m = meta[d.row.index];
        const last = slice.length + 1;
        if (m.kind === 'section' || m.kind === 'total') {
          d.cell.styles.fillColor = rgb(C.band);
          d.cell.styles.fontStyle = 'bold';
          return;
        }
        if (d.column.index === 0) return;
        if (d.column.index === last) {
          const { fg, bg } = bandColors(m.q.tally.pct);
          if (!m.q.nq.q.isGroup) {
            d.cell.styles.fillColor = rgb(bg);
            d.cell.styles.textColor = rgb(fg);
            d.cell.styles.fontStyle = 'bold';
          }
          return;
        }
        const v = slice[d.column.index - 1];
        if (!v || m.q.nq.q.isGroup) return;
        const o = visitOutcome(r.ctx, v.visit, m.q.nq.q);
        if (o === 'yes' || o === 'no') {
          const ok = compliantValue(m.q.nq.q) === o;
          d.cell.styles.fillColor = rgb(ok ? C.yes : C.no);
          d.cell.styles.textColor = [255, 255, 255];
          d.cell.styles.fontStyle = 'bold';
        } else if (o === 'na') {
          d.cell.styles.fillColor = rgb(C.naSoft);
          d.cell.styles.textColor = rgb(C.na);
        }
      },
      didDrawCell: (d) => {
        // Dealer names written vertically in the header.
        if (d.section === 'head' && d.column.index > 0 && d.column.index <= slice.length) {
          const label = slice[d.column.index - 1].label;
          doc.setFontSize(6);
          doc.setTextColor(255, 255, 255);
          const maxLen = 30;
          doc.text(label.length > maxLen ? label.slice(0, maxLen - 1) + '.' : label, d.cell.x + d.cell.width / 2 + 1, d.cell.y + d.cell.height - 1.5, { angle: 90 });
        }
      },
    });
  }
}
