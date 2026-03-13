'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type * as ExcelJS from 'exceljs';
// ExcelJS loaded dynamically to avoid SSR issues with Node.js deps
let _ExcelJSPromise: Promise<typeof ExcelJS> | null = null;
function getExcelJS(): Promise<typeof ExcelJS> {
  if (!_ExcelJSPromise) _ExcelJSPromise = import('exceljs').then((m) => (m.default ?? m) as unknown as typeof ExcelJS);
  return _ExcelJSPromise;
}
import { AgGridReact } from 'ag-grid-react';
import {
  ColDef,
  ValueFormatterParams,
  ICellRendererParams,
  ModuleRegistry,
  AllCommunityModule,
} from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { sheetsApi, exportApi, employeesApi } from '@/lib/api';
import { MONTH_NAMES, SHEET_STATUS_LABELS, SheetStatus } from '@/types';
import Link from 'next/link';

ModuleRegistry.registerModules([AllCommunityModule]);

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];
const LS_KEY = 'coretime_payroll_col_visibility';

// Colori colonne evidenziate
const BG_BASE  = '#eff6ff'; // blue-50  — imponibili paga base
const BG_REAL  = '#fef9c3'; // yellow-100 — imponibili paga reale
const BG_LORDO_BASE = '#dbeafe'; // blue-100
const BG_LORDO_REAL = '#fef08a'; // yellow-200

// ─── Definizione colonne statiche con ID univoci ──────────────────────────────
const STATIC_COL_DEFS: { id: string; label: string; defaultVisible: boolean }[] = [
  { id: 'cod',        label: 'Cod.',              defaultVisible: true  },
  { id: 'nominativo', label: 'Nominativo',        defaultVisible: true  },
  { id: 'pagaBase',   label: 'Paga Base €/h',     defaultVisible: true  },
  { id: 'pagaReale',  label: 'Paga Reale €/h',    defaultVisible: true  },
  { id: 'oreOrd',     label: 'Ore Ord.',          defaultVisible: true  },
  { id: 'oreStr',     label: 'Ore Str.',          defaultVisible: true  },
  { id: 'totOre',     label: 'Tot. Ore',          defaultVisible: true  },
  { id: 'ggMal',      label: 'Gg. Malattia',      defaultVisible: true  },
  { id: 'impOrdBase', label: 'Imp. Ord. (Base)',  defaultVisible: true  },
  { id: 'impStrBase', label: 'Imp. Str. (Base)',  defaultVisible: true  },
  { id: 'lordoBase',  label: 'Lordo (Base)',      defaultVisible: true  },
  { id: 'impOrdReal', label: 'Imp. Ord. (Reale)', defaultVisible: true  },
  { id: 'impStrReal', label: 'Imp. Str. (Reale)', defaultVisible: true  },
  { id: 'lordoReal',  label: 'Lordo (Reale)',     defaultVisible: true  },
];

function loadVisibility(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return Object.fromEntries(STATIC_COL_DEFS.map((c) => [c.id, c.defaultVisible]));
}

function saveVisibility(v: Record<string, boolean>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch {}
}

// ─── Tipi ────────────────────────────────────────────────────────────────────
interface PayrollRow {
  employee: { id: string; code: string; firstName: string; lastName: string; hourlyRate: number };
  totalOrdinary: number;
  totalOvertime: number;
  absences: Record<string, number>;
  rate: number;
  realRate: number | null;
  totH: number;
  sickDays: number;
  // imponibili su paga base (hourlyRate)
  impOrdBase: number;
  impStrBase: number;
  lordoBase: number;
  // imponibili su paga reale (realRate, fallback base)
  impOrdReal: number;
  impStrReal: number;
  lordoReal: number;
}

interface PayrollGroup {
  sheet: { id: string; year: number; month: number; status: SheetStatus };
  department: { id: string; name: string; color?: string };
  rows: PayrollRow[];
}

interface MonthSummary { month: number; count: number; }
type Level = 'months' | 'departments' | 'sheet';

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function enrichRow(r: any): PayrollRow {
  const base = Number(r.employee.hourlyRate);
  const real = r.realRate != null ? Number(r.realRate) : base;
  const ord = r.totalOrdinary;
  const str = r.totalOvertime;
  return {
    ...r,
    rate: base,
    realRate: r.realRate ?? null,
    totH: ord + str,
    sickDays: r.absences?.['M'] || 0,
    impOrdBase: ord * base,
    impStrBase: str * base * 1.25,
    lordoBase:  ord * base + str * base * 1.25,
    impOrdReal: ord * real,
    impStrReal: str * real * 1.25,
    lordoReal:  ord * real + str * real * 1.25,
  };
}

function enrichRows(rows: any[]): PayrollRow[] {
  return rows.map(enrichRow);
}

// ─── Renderer paga base anagrafica ───────────────────────────────────────────
function HourlyRateCellRenderer(params: ICellRendererParams & { onRateSaved: (id: string, rate: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const row: PayrollRow = params.data;
  if (!row) return null;

  const startEdit = () => { setValue(Number(row.employee.hourlyRate).toFixed(2)); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); };
  const cancel = () => setEditing(false);
  const save = async () => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) { cancel(); return; }
    if (parsed === Number(row.employee.hourlyRate)) { setEditing(false); return; }
    setSaving(true);
    try { await employeesApi.updateHourlyRate(row.employee.id, parsed); params.onRateSaved(row.employee.id, parsed); setEditing(false); }
    catch (err: any) { alert(err.response?.data?.message || 'Errore'); }
    finally { setSaving(false); }
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); };

  if (editing) return (
    <div className="flex items-center gap-1 h-full">
      <input ref={inputRef} type="number" min={0} step={0.01} value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey} className="w-20 border border-blue-400 rounded px-1 text-xs focus:outline-none" disabled={saving} autoFocus />
      <button onClick={save} className="text-green-600 text-xs font-bold">✓</button>
      <button onClick={cancel} className="text-gray-400 text-xs">✕</button>
    </div>
  );
  return (
    <button onClick={startEdit} className="group flex items-center gap-1 h-full w-full hover:text-blue-700" title="Paga anagrafica">
      <span className="font-mono">€ {Number(row.employee.hourlyRate).toFixed(2)}</span>
      <span className="opacity-0 group-hover:opacity-50 text-xs text-blue-400">✎</span>
    </button>
  );
}

// ─── Renderer paga reale per dipendente ──────────────────────────────────────
function RealRateCellRenderer(params: ICellRendererParams & { onRealRateSaved: (empId: string, rate: number) => void; sheetId: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const row: PayrollRow = params.data;
  if (!row) return null;

  const current = row.realRate;
  const startEdit = () => { setValue(current != null ? Number(current).toFixed(2) : Number(row.employee.hourlyRate).toFixed(2)); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); };
  const cancel = () => setEditing(false);
  const save = async () => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) { cancel(); return; }
    setSaving(true);
    try {
      await sheetsApi.upsertEmployeeRate(params.sheetId, row.employee.id, parsed);
      params.onRealRateSaved(row.employee.id, parsed);
      setEditing(false);
    }
    catch (err: any) { alert(err.response?.data?.message || 'Errore'); }
    finally { setSaving(false); }
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); };

  if (editing) return (
    <div className="flex items-center gap-1 h-full">
      <input ref={inputRef} type="number" min={0} step={0.01} value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey} className="w-20 border border-orange-400 rounded px-1 text-xs focus:outline-none" disabled={saving} autoFocus />
      <button onClick={save} className="text-green-600 text-xs font-bold">✓</button>
      <button onClick={cancel} className="text-gray-400 text-xs">✕</button>
    </div>
  );
  return (
    <button onClick={startEdit} className="group flex items-center gap-1 h-full w-full hover:text-orange-700" title="Paga reale del mese per questo dipendente">
      {current != null
        ? <span className="font-mono">€ {Number(current).toFixed(2)}</span>
        : <span className="text-gray-400 italic text-xs">— imposta</span>}
      <span className="opacity-0 group-hover:opacity-50 text-xs text-orange-400">✎</span>
    </button>
  );
}

// ─── Pannello visibilità colonne ──────────────────────────────────────────────
function ColVisPanel({ visibility, onChange, onClose }: {
  visibility: Record<string, boolean>;
  onChange: (id: string, v: boolean) => void;
  onClose: () => void;
}) {
  const groups = [
    { label: 'Identificativo', ids: ['cod', 'nominativo'] },
    { label: 'Paghe', ids: ['pagaBase', 'pagaReale'] },
    { label: 'Ore', ids: ['oreOrd', 'oreStr', 'totOre', 'ggMal'] },
    { label: 'Imponibili Paga Base', ids: ['impOrdBase', 'impStrBase', 'lordoBase'] },
    { label: 'Imponibili Paga Reale', ids: ['impOrdReal', 'impStrReal', 'lordoReal'] },
  ];
  const labelOf = (id: string) => STATIC_COL_DEFS.find((c) => c.id === id)?.label ?? id;

  return (
    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">Colonne visibili</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{g.label}</p>
            <div className="space-y-1">
              {g.ids.map((id) => (
                <label key={id} className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={visibility[id] ?? true}
                    onChange={(e) => onChange(id, e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">{labelOf(id)}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => { STATIC_COL_DEFS.forEach((c) => onChange(c.id, c.defaultVisible)); }}
        className="mt-3 text-xs text-blue-600 hover:underline">
        Ripristina predefiniti
      </button>
    </div>
  );
}

// ─── Pagina principale ────────────────────────────────────────────────────────
export default function PayrollPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [level, setLevel] = useState<Level>('months');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<PayrollGroup | null>(null);
  const [allGroups, setAllGroups] = useState<PayrollGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [showColPanel, setShowColPanel] = useState(false);
  const gridRef = useRef<AgGridReact>(null);

  // Carica visibilità da localStorage (solo client)
  useEffect(() => { setVisibility(loadVisibility()); }, []);

  const handleVisChange = useCallback((id: string, v: boolean) => {
    setVisibility((prev) => {
      const next = { ...prev, [id]: v };
      saveVisibility(next);
      return next;
    });
  }, []);

  const loadYear = (y: number) => {
    setLoading(true);
    Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        sheetsApi.getPayrollView(y, i + 1).catch(() => [])
      )
    ).then((results) => {
      const flat = results.flatMap((r, i) =>
        r.map((g: any) => ({
          ...g,
          sheet: { ...g.sheet, month: i + 1 },
          rows: enrichRows(g.rows),
        }))
      );
      setAllGroups(flat);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    setLevel('months'); setSelectedMonth(null); setSelectedGroup(null);
    loadYear(year);
  }, [year]);

  const monthSummaries: MonthSummary[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    count: allGroups.filter((g) => g.sheet.month === i + 1).length,
  })).filter((m) => m.count > 0);

  const departmentGroups = selectedMonth ? allGroups.filter((g) => g.sheet.month === selectedMonth) : [];

  const goToMonths = () => { setLevel('months'); setSelectedMonth(null); setSelectedGroup(null); };
  const goToDept   = (month: number) => { setSelectedMonth(month); setLevel('departments'); setSelectedGroup(null); };
  const goToSheet  = (group: PayrollGroup) => { setSelectedGroup(group); setLevel('sheet'); };

  const handleRateSaved = useCallback((empId: string, newRate: number) => {
    const patch = (rows: PayrollRow[]) => enrichRows(
      rows.map((r) => r.employee.id === empId ? { ...r, employee: { ...r.employee, hourlyRate: newRate } } : r)
    );
    setSelectedGroup((prev) => prev ? { ...prev, rows: patch(prev.rows) } : prev);
    setAllGroups((prev) => prev.map((g) => ({ ...g, rows: patch(g.rows) })));
  }, []);

  const handleRealRateSaved = useCallback((empId: string, newRealRate: number) => {
    const patch = (rows: PayrollRow[]) => enrichRows(
      rows.map((r) => r.employee.id === empId ? { ...r, realRate: newRealRate } : r)
    );
    setSelectedGroup((prev) => {
      if (!prev) return prev;
      const updated: PayrollGroup = { ...prev, rows: patch(prev.rows) };
      setAllGroups((all) => all.map((g) => g.sheet.id === prev.sheet.id ? updated : g));
      return updated;
    });
  }, []);

  const downloadPdf = async (sheetId: string, deptName: string) => {
    try { triggerBlobDownload(await exportApi.downloadPayroll(sheetId), `prospetto-paghe-${deptName}.pdf`); }
    catch { alert('Errore download PDF'); }
  };

  const exportExcel = useCallback(async () => {
    if (!selectedGroup) return;
    const ExcelJS = await getExcelJS();
    const { rows, department, sheet } = selectedGroup;
    const monthName = MONTH_NAMES[sheet.month - 1];
    const absKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.absences)))).sort();
    const nRows = rows.length;

    // ─── Colori (corrispondono alla view) ──────────────────────────────────────
    const C = {
      headerDark:  'FF1F2937', // gray-900
      headerMid:   'FF374151', // gray-700
      white:       'FFFFFFFF',
      grayLight:   'FFF9FAFB', // gray-50
      base:        'FFEFF6FF', // blue-50
      baseStrong:  'FFDBEAFE', // blue-100 (Lordo Base)
      real:        'FFFEF9C3', // yellow-100
      realStrong:  'FFFEF08A', // yellow-200 (Lordo Reale)
      realCell:    'FFFFF7ED', // orange-50 (Paga Reale)
      totalBg:     'FFE2E8F0', // slate-200
      totalBorder: 'FF94A3B8', // slate-400
      malattia:    'FFFEF9C3', // yellow-50
      blue700:     'FF1D4ED8',
      amber700:    'FFB45309',
      gray500:     'FF6B7280',
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'CoreTime';
    const ws = wb.addWorksheet(`${monthName} ${sheet.year}`, {
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
    });

    // ─── Helper stile cella ───────────────────────────────────────────────────
    const style = (
      cell: ExcelJS.Cell,
      opts: {
        bg?: string; bold?: boolean; italic?: boolean; color?: string;
        align?: ExcelJS.Alignment['horizontal']; border?: boolean; numFmt?: string;
        borderTop?: boolean; fontSize?: number;
      }
    ) => {
      if (opts.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
      cell.font = { bold: opts.bold, italic: opts.italic, color: { argb: opts.color ?? 'FF000000' }, size: opts.fontSize ?? 10 };
      cell.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle' };
      if (opts.border || opts.borderTop) {
        cell.border = {
          top:    { style: opts.borderTop ? 'medium' : 'thin', color: { argb: 'FF9CA3AF' } },
          bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
          left:   { style: 'thin', color: { argb: 'FF9CA3AF' } },
          right:  { style: 'thin', color: { argb: 'FF9CA3AF' } },
        };
      }
      if (opts.numFmt) cell.numFmt = opts.numFmt;
    };

    // ─── Riga titolo ──────────────────────────────────────────────────────────
    ws.addRow([]);
    const titleRow = ws.addRow([`PROSPETTO PAGHE — ${department.name.toUpperCase()} — ${monthName.toUpperCase()} ${sheet.year}`]);
    ws.mergeCells(2, 1, 2, 14 + absKeys.length);
    style(titleRow.getCell(1), { bg: C.headerDark, bold: true, color: C.white, align: 'center', fontSize: 12 });
    titleRow.height = 22;
    ws.addRow([]);

    // ─── Intestazioni colonne ─────────────────────────────────────────────────
    const staticHeaders = [
      { label: 'Cod.',              width: 9,  bg: C.headerMid, align: 'center' as const },
      { label: 'Nominativo',        width: 24, bg: C.headerMid, align: 'left'   as const },
      { label: 'Paga Base €/h',     width: 14, bg: C.headerMid, align: 'center' as const },
      { label: 'Paga Reale €/h',    width: 14, bg: C.realCell,  align: 'center' as const },
      { label: 'Ore Ord.',          width: 10, bg: C.headerMid, align: 'center' as const },
      { label: 'Ore Str.',          width: 10, bg: C.headerMid, align: 'center' as const },
      { label: 'Tot. Ore',          width: 10, bg: C.headerMid, align: 'center' as const },
      { label: 'Gg. Malattia',      width: 13, bg: C.headerMid, align: 'center' as const },
      { label: 'Imp. Ord. (Base)',  width: 15, bg: C.base,      align: 'center' as const },
      { label: 'Imp. Str. (Base)',  width: 15, bg: C.base,      align: 'center' as const },
      { label: 'Lordo (Base)',      width: 14, bg: C.baseStrong,align: 'center' as const },
      { label: 'Imp. Ord. (Reale)', width: 15, bg: C.real,      align: 'center' as const },
      { label: 'Imp. Str. (Reale)', width: 15, bg: C.real,      align: 'center' as const },
      { label: 'Lordo (Reale)',     width: 14, bg: C.realStrong,align: 'center' as const },
      ...absKeys.map((k) => ({ label: k, width: 9, bg: C.headerMid, align: 'center' as const })),
    ];

    staticHeaders.forEach((h, i) => { ws.getColumn(i + 1).width = h.width; });

    const hdrRow = ws.addRow(staticHeaders.map((h) => h.label)); // row 4
    hdrRow.height = 18;
    staticHeaders.forEach((h, i) => {
      const cell = hdrRow.getCell(i + 1);
      style(cell, { bg: h.bg, bold: true, color: C.white, align: h.align, border: true });
    });
    // Override colori testo per colonne evidenziate
    style(hdrRow.getCell(9),  { bg: C.base,       bold: true, color: 'FF1E3A5F', align: 'center', border: true });
    style(hdrRow.getCell(10), { bg: C.base,       bold: true, color: 'FF1E3A5F', align: 'center', border: true });
    style(hdrRow.getCell(11), { bg: C.baseStrong, bold: true, color: 'FF1E40AF', align: 'center', border: true });
    style(hdrRow.getCell(12), { bg: C.real,       bold: true, color: 'FF78350F', align: 'center', border: true });
    style(hdrRow.getCell(13), { bg: C.real,       bold: true, color: 'FF78350F', align: 'center', border: true });
    style(hdrRow.getCell(14), { bg: C.realStrong, bold: true, color: 'FF92400E', align: 'center', border: true });
    style(hdrRow.getCell(4),  { bg: C.realCell,   bold: true, color: 'FFC2410C', align: 'center', border: true });

    // ─── Righe dati con formule ────────────────────────────────────────────────
    // Colonne: A=cod B=nom C=pagaBase D=pagaReale E=oreOrd F=oreStr G=totOre H=ggMal
    //          I=impOrdBase J=impStrBase K=lordoBase L=impOrdReal M=impStrReal N=lordoReal
    //          O..=assenze
    const DATA_START = 5; // row Excel 1-based
    rows.forEach((r, i) => {
      const rowNum = DATA_START + i;
      const isOdd = i % 2 === 0;
      const rowBg = isOdd ? C.white : C.grayLight;

      const cells: (string | number)[] = [
        r.employee.code,
        `${r.employee.lastName} ${r.employee.firstName}`,
        Number(r.employee.hourlyRate),
        r.realRate != null ? Number(r.realRate) : '',
        r.totalOrdinary,
        r.totalOvertime,
        { formula: `E${rowNum}+F${rowNum}` } as any,
        r.absences?.['M'] || 0,
        { formula: `E${rowNum}*C${rowNum}` } as any,
        { formula: `F${rowNum}*C${rowNum}*1.25` } as any,
        { formula: `I${rowNum}+J${rowNum}` } as any,
        { formula: `E${rowNum}*IF(D${rowNum}="",C${rowNum},D${rowNum})` } as any,
        { formula: `F${rowNum}*IF(D${rowNum}="",C${rowNum},D${rowNum})*1.25` } as any,
        { formula: `L${rowNum}+M${rowNum}` } as any,
        ...absKeys.map((k) => r.absences[k] || 0),
      ];

      const exRow = ws.addRow(cells);
      exRow.height = 16;

      // stile per colonna
      style(exRow.getCell(1),  { bg: rowBg, align: 'center', color: C.gray500, border: true });
      style(exRow.getCell(2),  { bg: rowBg, bold: true, border: true });
      style(exRow.getCell(3),  { bg: rowBg, align: 'right', numFmt: '€ #,##0.00', border: true });
      style(exRow.getCell(4),  { bg: C.realCell, align: 'right', numFmt: '€ #,##0.00', border: true });
      style(exRow.getCell(5),  { bg: rowBg, align: 'center', border: true });
      style(exRow.getCell(6),  { bg: rowBg, align: 'center', color: C.blue700, border: true });
      style(exRow.getCell(7),  { bg: rowBg, align: 'center', border: true });
      style(exRow.getCell(8),  { bg: C.malattia, align: 'center', color: C.amber700, border: true });
      style(exRow.getCell(9),  { bg: C.base,       align: 'right', numFmt: '€ #,##0.00', border: true });
      style(exRow.getCell(10), { bg: C.base,       align: 'right', numFmt: '€ #,##0.00', color: C.blue700, border: true });
      style(exRow.getCell(11), { bg: C.baseStrong, align: 'right', numFmt: '€ #,##0.00', bold: true, border: true });
      style(exRow.getCell(12), { bg: C.real,       align: 'right', numFmt: '€ #,##0.00', border: true });
      style(exRow.getCell(13), { bg: C.real,       align: 'right', numFmt: '€ #,##0.00', color: C.amber700, border: true });
      style(exRow.getCell(14), { bg: C.realStrong, align: 'right', numFmt: '€ #,##0.00', bold: true, border: true });
      absKeys.forEach((_, ai) => {
        style(exRow.getCell(15 + ai), { bg: rowBg, align: 'center', color: C.amber700, border: true });
      });
    });

    // ─── Riga TOTALE ──────────────────────────────────────────────────────────
    const totRowNum = DATA_START + nRows;
    const lastDataRow = totRowNum - 1;
    const totCells: any[] = [
      '',
      'TOTALE REPARTO',
      '',
      '',
      { formula: `SUM(E${DATA_START}:E${lastDataRow})` },
      { formula: `SUM(F${DATA_START}:F${lastDataRow})` },
      { formula: `SUM(G${DATA_START}:G${lastDataRow})` },
      { formula: `SUM(H${DATA_START}:H${lastDataRow})` },
      { formula: `SUM(I${DATA_START}:I${lastDataRow})` },
      { formula: `SUM(J${DATA_START}:J${lastDataRow})` },
      { formula: `SUM(K${DATA_START}:K${lastDataRow})` },
      { formula: `SUM(L${DATA_START}:L${lastDataRow})` },
      { formula: `SUM(M${DATA_START}:M${lastDataRow})` },
      { formula: `SUM(N${DATA_START}:N${lastDataRow})` },
      ...absKeys.map((_, ai) => ({ formula: `SUM(${String.fromCharCode(79 + ai)}${DATA_START}:${String.fromCharCode(79 + ai)}${lastDataRow})` })),
    ];

    const totExRow = ws.addRow(totCells);
    totExRow.height = 18;
    style(totExRow.getCell(1),  { bg: C.totalBg, align: 'center', bold: true, borderTop: true, border: true });
    style(totExRow.getCell(2),  { bg: C.totalBg, bold: true, italic: true, borderTop: true, border: true });
    style(totExRow.getCell(3),  { bg: C.totalBg, borderTop: true, border: true });
    style(totExRow.getCell(4),  { bg: C.totalBg, borderTop: true, border: true });
    style(totExRow.getCell(5),  { bg: C.totalBg, align: 'center', bold: true, borderTop: true, border: true });
    style(totExRow.getCell(6),  { bg: C.totalBg, align: 'center', bold: true, color: C.blue700, borderTop: true, border: true });
    style(totExRow.getCell(7),  { bg: C.totalBg, align: 'center', bold: true, borderTop: true, border: true });
    style(totExRow.getCell(8),  { bg: C.totalBg, align: 'center', bold: true, color: C.amber700, borderTop: true, border: true });
    style(totExRow.getCell(9),  { bg: C.baseStrong, align: 'right', bold: true, numFmt: '€ #,##0.00', borderTop: true, border: true });
    style(totExRow.getCell(10), { bg: C.baseStrong, align: 'right', bold: true, numFmt: '€ #,##0.00', color: C.blue700, borderTop: true, border: true });
    style(totExRow.getCell(11), { bg: C.baseStrong, align: 'right', bold: true, numFmt: '€ #,##0.00', borderTop: true, border: true, fontSize: 11 });
    style(totExRow.getCell(12), { bg: C.realStrong, align: 'right', bold: true, numFmt: '€ #,##0.00', borderTop: true, border: true });
    style(totExRow.getCell(13), { bg: C.realStrong, align: 'right', bold: true, numFmt: '€ #,##0.00', color: C.amber700, borderTop: true, border: true });
    style(totExRow.getCell(14), { bg: C.realStrong, align: 'right', bold: true, numFmt: '€ #,##0.00', borderTop: true, border: true, fontSize: 11 });
    absKeys.forEach((_, ai) => {
      style(totExRow.getCell(15 + ai), { bg: C.totalBg, align: 'center', bold: true, color: C.amber700, borderTop: true, border: true });
    });

    // ─── Freeze prima colonna + riga header ───────────────────────────────────
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];

    // ─── Download ─────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    triggerBlobDownload(blob, `paghe-${department.name}-${monthName}-${sheet.year}.xlsx`);
  }, [selectedGroup]);

  // ─── Colonne AG Grid ─────────────────────────────────────────────────────────
  const absenceKeys = selectedGroup
    ? Array.from(new Set(selectedGroup.rows.flatMap((r) => Object.keys(r.absences)))).sort()
    : [];

  const sheetId = selectedGroup?.sheet.id ?? '';
  const vis = visibility;

  const show = (id: string) => vis[id] !== false; // default true se non in localStorage ancora

  const colDefs: ColDef<PayrollRow>[] = [
    show('cod') && {
      headerName: 'Cod.', width: 70, pinned: 'left',
      cellClass: 'font-mono text-gray-500',
      valueGetter: (p: any) => p.data?.employee.code,
    },
    show('nominativo') && {
      headerName: 'Nominativo', width: 180, pinned: 'left',
      cellClass: 'font-medium',
      valueGetter: (p: any) => p.data ? `${p.data.employee.lastName} ${p.data.employee.firstName}` : '',
    },
    show('pagaBase') && {
      headerName: 'Paga Base €/h', width: 130,
      cellRendererSelector: (p: any) => p.data?._isPinned ? undefined : { component: HourlyRateCellRenderer, params: { onRateSaved: handleRateSaved } },
      valueGetter: (p: any) => p.data?._isPinned ? '' : (p.data?.rate ?? 0),
      headerTooltip: 'Paga base anagrafica',
    },
    show('pagaReale') && {
      headerName: 'Paga Reale €/h', width: 130,
      cellRendererSelector: (p: any) => p.data?._isPinned ? undefined : { component: RealRateCellRenderer, params: { onRealRateSaved: handleRealRateSaved, sheetId } },
      valueGetter: (p: any) => p.data?._isPinned ? '' : (p.data?.realRate ?? null),
      headerTooltip: 'Paga reale del mese — individuale per dipendente',
      cellStyle: { backgroundColor: '#fff7ed' },
    },
    show('oreOrd') && {
      headerName: 'Ore Ord.', field: 'totalOrdinary', width: 90, type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams) => p.value > 0 ? p.value : '—',
      cellClass: 'font-mono',
    },
    show('oreStr') && {
      headerName: 'Ore Str.', field: 'totalOvertime', width: 90, type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams) => p.value > 0 ? p.value : '—',
      cellClass: 'font-mono text-blue-700',
    },
    show('totOre') && {
      headerName: 'Tot. Ore', field: 'totH', width: 85, type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams) => p.value > 0 ? p.value : '—',
      cellClass: 'font-mono text-gray-600',
    },
    show('ggMal') && {
      headerName: 'Gg. Mal.', field: 'sickDays', width: 85, type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams) => p.value > 0 ? String(p.value) : '—',
      cellClass: 'font-mono text-red-600',
    },
    // ─── Imponibili paga base (sfondo blu chiaro) ──
    show('impOrdBase') && {
      headerName: 'Imp.Ord. Base', field: 'impOrdBase', width: 120, type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams) => p.value > 0 ? p.value.toFixed(2) : '—',
      cellClass: 'font-mono', cellStyle: { backgroundColor: BG_BASE },
    },
    show('impStrBase') && {
      headerName: 'Imp.Str. Base', field: 'impStrBase', width: 120, type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams) => p.value > 0 ? p.value.toFixed(2) : '—',
      cellClass: 'font-mono text-blue-700', cellStyle: { backgroundColor: BG_BASE },
      headerTooltip: '+25% maggiorazione',
    },
    show('lordoBase') && {
      headerName: 'Lordo Base', field: 'lordoBase', width: 120, type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams) => p.value > 0 ? p.value.toFixed(2) : '—',
      cellClass: 'font-mono font-bold', cellStyle: { backgroundColor: BG_LORDO_BASE },
    },
    // ─── Imponibili paga reale (sfondo giallo) ──
    show('impOrdReal') && {
      headerName: 'Imp.Ord. Reale', field: 'impOrdReal', width: 125, type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams) => p.value > 0 ? p.value.toFixed(2) : '—',
      cellClass: 'font-mono', cellStyle: { backgroundColor: BG_REAL },
    },
    show('impStrReal') && {
      headerName: 'Imp.Str. Reale', field: 'impStrReal', width: 125, type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams) => p.value > 0 ? p.value.toFixed(2) : '—',
      cellClass: 'font-mono text-amber-700', cellStyle: { backgroundColor: BG_REAL },
      headerTooltip: '+25% maggiorazione',
    },
    show('lordoReal') && {
      headerName: 'Lordo Reale', field: 'lordoReal', width: 120, type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams) => p.value > 0 ? p.value.toFixed(2) : '—',
      cellClass: 'font-mono font-bold text-gray-900', cellStyle: { backgroundColor: BG_LORDO_REAL },
    },
    // ─── Codici assenza dinamici ──
    ...absenceKeys.map((k) => ({
      headerName: k, width: 70, type: 'numericColumn',
      valueGetter: (p: any) => p.data?.absences[k] || 0,
      valueFormatter: (p: ValueFormatterParams) => p.value > 0 ? String(p.value) : '—',
      cellClass: 'font-mono text-amber-700',
    } as ColDef<PayrollRow>)),
  ].filter(Boolean) as ColDef<PayrollRow>[];

  const pinnedBottomData = selectedGroup ? (() => {
    const rows = selectedGroup.rows;
    return [{
      _isPinned: true,
      employee: { code: '', firstName: 'TOTALE', lastName: 'REPARTO', id: '', hourlyRate: 0 },
      totalOrdinary: rows.reduce((s, r) => s + r.totalOrdinary, 0),
      totalOvertime: rows.reduce((s, r) => s + r.totalOvertime, 0),
      totH:      rows.reduce((s, r) => s + r.totH, 0),
      sickDays:  rows.reduce((s, r) => s + r.sickDays, 0),
      impOrdBase: rows.reduce((s, r) => s + r.impOrdBase, 0),
      impStrBase: rows.reduce((s, r) => s + r.impStrBase, 0),
      lordoBase:  rows.reduce((s, r) => s + r.lordoBase, 0),
      impOrdReal: rows.reduce((s, r) => s + r.impOrdReal, 0),
      impStrReal: rows.reduce((s, r) => s + r.impStrReal, 0),
      lordoReal:  rows.reduce((s, r) => s + r.lordoReal, 0),
      rate: 0, realRate: null,
      absences: absenceKeys.reduce((acc, k) => ({ ...acc, [k]: rows.reduce((s, r) => s + (r.absences[k] || 0), 0) }), {}),
    }];
  })() : [];

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Prospetto Paghe</h1>
          <nav className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
            <button className="hover:text-gray-900" onClick={goToMonths}>{year}</button>
            {selectedMonth !== null && (
              <><span>/</span>
              <button className="hover:text-gray-900" onClick={() => { setLevel('departments'); setSelectedGroup(null); }}>
                {MONTH_NAMES[selectedMonth - 1]}
              </button></>
            )}
            {selectedGroup && <><span>/</span><span className="text-gray-900 font-medium">{selectedGroup.department.name}</span></>}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {level === 'sheet' && selectedGroup && (
            <>
              {/* Bottone colonne visibili */}
              <div className="relative">
                <button className="btn-secondary text-xs" onClick={() => setShowColPanel((v) => !v)}>
                  Colonne ▾
                </button>
                {showColPanel && (
                  <ColVisPanel visibility={vis} onChange={handleVisChange} onClose={() => setShowColPanel(false)} />
                )}
              </div>
              <button className="btn-secondary text-xs" onClick={exportExcel}>Esporta Excel</button>
              <button className="btn-secondary text-xs" onClick={() => downloadPdf(selectedGroup.sheet.id, selectedGroup.department.name)}>Scarica PDF</button>
              <Link href={`/sheets/${selectedGroup.sheet.id}`} className="btn-secondary text-xs">Vai al foglio</Link>
              <span className={`badge-${selectedGroup.sheet.status}`}>{SHEET_STATUS_LABELS[selectedGroup.sheet.status]}</span>
            </>
          )}
          <select className="input w-auto text-sm py-1" value={year} onChange={(e) => setYear(+e.target.value)}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading && <p className="text-gray-400 text-sm">Caricamento...</p>}

      {/* ── Mesi ── */}
      {!loading && level === 'months' && (
        monthSummaries.length === 0
          ? <div className="card p-8 text-center text-gray-400">Nessun foglio inviato o bloccato per il {year}.</div>
          : <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {monthSummaries.map(({ month, count }) => (
                <button key={month} onClick={() => goToDept(month)}
                  className="card p-5 text-left hover:shadow-md transition-all hover:-translate-y-0.5 group">
                  <p className="text-lg font-bold text-gray-900 group-hover:text-blue-700">{MONTH_NAMES[month - 1]}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{count} {count === 1 ? 'reparto' : 'reparti'}</p>
                </button>
              ))}
            </div>
      )}

      {/* ── Reparti ── */}
      {!loading && level === 'departments' && selectedMonth && (
        <div className="card divide-y divide-gray-100">
          {departmentGroups.map((group) => (
            <button key={group.sheet.id} onClick={() => goToSheet(group)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left group">
              <div className="flex items-center gap-3">
                {group.department.color && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.department.color }} />}
                <div>
                  <p className="font-medium text-gray-900 group-hover:text-blue-700">{group.department.name}</p>
                  <p className="text-xs text-gray-500">{group.rows.length} dipendenti</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge-${group.sheet.status}`}>{SHEET_STATUS_LABELS[group.sheet.status]}</span>
                <span className="text-gray-400">→</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Data Grid ── */}
      {!loading && level === 'sheet' && selectedGroup && (
        <div className="ag-theme-quartz flex-1" style={{ minHeight: 400 }}>
          <AgGridReact<PayrollRow>
            ref={gridRef}
            rowData={selectedGroup.rows}
            columnDefs={colDefs}
            pinnedBottomRowData={pinnedBottomData}
            defaultColDef={{ resizable: true, sortable: true, filter: false }}
            rowHeight={36}
            headerHeight={40}
            domLayout="autoHeight"
            suppressMovableColumns={false}
            enableCellTextSelection={true}
            getRowStyle={(params) => {
              if (params.node.rowPinned === 'bottom')
                return { fontWeight: 'bold', backgroundColor: '#f1f5f9', borderTop: '2px solid #94a3b8' };
              return undefined;
            }}
          />
        </div>
      )}
    </div>
  );
}
