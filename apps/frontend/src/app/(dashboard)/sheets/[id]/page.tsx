'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { sheetsApi, exportApi } from '@/lib/api';
import { MONTH_NAMES, ABSENCE_CODES, SHEET_STATUS_LABELS } from '@/types';

const QUICK_ACTIONS = [
  { label: 'FE — Festivo', absenceCode: 'FE' },
  { label: 'F — Ferie', absenceCode: 'F' },
  { label: 'M — Malattia', absenceCode: 'M' },
  { label: 'P — Permesso', absenceCode: 'P' },
  { label: 'AS — Assente', absenceCode: 'AS' },
  { label: '8h ordinarie', ordinaryHours: 8 },
  { label: '0h (svuota)', clear: true },
];

function buildDays(year: number, month: number) {
  const days: { day: number; type: 'weekday' | 'saturday' | 'sunday' }[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    days.push({ day: d, type: dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'weekday' });
  }
  return days;
}

function buildEntryMap(entries: any[]) {
  const map: Record<string, Record<number, any>> = {};
  for (const e of entries) {
    if (!map[e.employeeId]) map[e.employeeId] = {};
    map[e.employeeId][e.day] = e;
  }
  return map;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SheetPage() {
  const { id } = useParams() as { id: string };
  const [sheet, setSheet] = useState<any>(null);
  const [days, setDays] = useState<any[]>([]);
  const [entryMap, setEntryMap] = useState<Record<string, Record<number, any>>>({});
  const [loading, setLoading] = useState(true);
  const [editCell, setEditCell] = useState<{ empId: string; day: number } | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ day: number; x: number; y: number } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const s = await sheetsApi.get(id);
    setSheet(s);
    setDays(buildDays(s.year, s.month));
    setEntryMap(buildEntryMap(s.entries || []));
    setLoading(false);
  }, [id]);

  React.useEffect(() => { reload(); }, [reload]);

  // Close context menu on outside click
  React.useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const openEdit = (empId: string, day: number) => {
    if (sheet?.status !== 'draft') return;
    const entry = entryMap[empId]?.[day];
    setForm({
      ordinaryHours: entry?.ordinaryHours,
      overtimeHours: entry?.overtimeHours,
      absenceCode: entry?.absenceCode || '',
    });
    setEditCell({ empId, day });
  };

  const saveEntry = async () => {
    if (!editCell || !sheet) return;
    setSaving(true);
    try {
      await sheetsApi.upsertEntry(id, {
        employeeId: editCell.empId,
        day: editCell.day,
        ordinaryHours: form.absenceCode ? undefined : form.ordinaryHours,
        overtimeHours: form.absenceCode ? undefined : form.overtimeHours,
        absenceCode: form.absenceCode || undefined,
      });
      await reload();
      setEditCell(null);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const openColumnMenu = (day: number, e: React.MouseEvent) => {
    if (sheet?.status !== 'draft') return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ day, x: rect.left, y: rect.bottom + 4 });
  };

  const applyBulkAction = async (day: number, action: any) => {
    if (!sheet) return;
    setContextMenu(null);
    setBulkLoading(true);
    try {
      await Promise.all(
        employees.map((emp) =>
          sheetsApi.upsertEntry(id, {
            employeeId: emp.id,
            day,
            ordinaryHours: 'clear' in action ? undefined : 'ordinaryHours' in action ? action.ordinaryHours : undefined,
            overtimeHours: undefined,
            absenceCode: 'absenceCode' in action ? action.absenceCode : undefined,
          })
        )
      );
      await reload();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Errore');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!confirm('Inviare il foglio all\'HR? Non sarà più modificabile senza riapertura.')) return;
    await sheetsApi.submit(id);
    reload();
  };

  const handleLock = async () => {
    if (!confirm('Bloccare definitivamente il foglio?')) return;
    await sheetsApi.lock(id);
    reload();
  };

  const handleReopen = async () => {
    await sheetsApi.reopen(id);
    reload();
  };

  const handleDownload = async (type: 'blank' | 'filled') => {
    try {
      const blob = type === 'blank'
        ? await exportApi.downloadBlank(id)
        : await exportApi.downloadFilled(id);
      const filename = type === 'blank'
        ? `foglio-presenze-${id}.pdf`
        : `presenze-compilate-${id}.pdf`;
      triggerDownload(blob, filename);
    } catch {
      alert('Errore nel download del PDF');
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Caricamento...</div>;
  if (!sheet) return <div className="p-8 text-red-500">Foglio non trovato</div>;

  const employees = Array.from(
    new Map(sheet.entries?.map((e: any) => [e.employeeId, e.employee])).values() as any
  ).sort((a: any, b: any) => a.lastName.localeCompare(b.lastName)) as any[];

  const monthName = MONTH_NAMES[sheet.month - 1];
  const isDraft = sheet.status === 'draft';

  const getTotals = (empId: string) => {
    let ord = 0, ot = 0;
    for (const { day } of days) {
      const entry = entryMap[empId]?.[day];
      if (entry && !entry.absenceCode) {
        ord += Number(entry.ordinaryHours || 0);
        ot += Number(entry.overtimeHours || 0);
      }
    }
    return { ord, ot };
  };

  const headerBg = (type: string) =>
    type === 'saturday' ? 'bg-blue-700' : type === 'sunday' ? 'bg-purple-700' : '';

  const cellBg = (type: string) =>
    type === 'saturday' ? 'bg-blue-50' : type === 'sunday' ? 'bg-purple-50' : '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/sheets" className="hover:text-gray-900">Fogli</Link>
            <span>/</span>
            <span>{sheet.department.name} — {monthName} {sheet.year}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{sheet.department.name}</h1>
          <p className="text-gray-500">{monthName} {sheet.year}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge-${sheet.status}`}>{SHEET_STATUS_LABELS[sheet.status as keyof typeof SHEET_STATUS_LABELS]}</span>
          <button className="btn-secondary text-xs" onClick={() => handleDownload('blank')}>
            Scarica PDF vuoto
          </button>
          {sheet.status !== 'draft' && (
            <button className="btn-secondary text-xs" onClick={() => handleDownload('filled')}>
              Scarica PDF compilato
            </button>
          )}
          {isDraft && (
            <button className="btn-primary text-xs" onClick={handleSubmit}>
              Invia all'HR
            </button>
          )}
          {sheet.status === 'submitted' && (
            <>
              <button className="btn-secondary text-xs" onClick={handleReopen}>Riapri</button>
              <button className="btn-primary text-xs" onClick={handleLock}>Blocca</button>
            </>
          )}
        </div>
      </div>

      {bulkLoading && (
        <div className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
          Applicazione azione rapida in corso...
        </div>
      )}

      {/* Grid */}
      <div className="card overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="px-2 py-2 text-left font-medium sticky left-0 bg-gray-900 z-10 min-w-[50px]" rowSpan={2}>
                COD.
              </th>
              <th className="px-2 py-2 text-left font-medium sticky left-[50px] bg-gray-900 z-10 min-w-[140px]" rowSpan={2}>
                {monthName.toUpperCase()}
              </th>
              {days.map(({ day, type }) => (
                <th
                  key={day}
                  title={isDraft ? 'Click per azione rapida su tutta la colonna' : undefined}
                  className={`px-1 py-1 font-medium text-center min-w-[36px] select-none ${headerBg(type)} ${isDraft ? 'cursor-pointer hover:brightness-125 transition-all' : ''}`}
                  onClick={(e) => isDraft && openColumnMenu(day, e)}
                >
                  {day}
                </th>
              ))}
              <th className="px-2 py-1 font-medium text-center min-w-[40px] bg-gray-800" rowSpan={2}>
                TOT
              </th>
            </tr>
            <tr className="bg-gray-800 text-white text-[10px]">
              {days.map(({ day, type }) => (
                <th
                  key={day}
                  className={`px-1 py-0.5 font-normal text-center select-none ${headerBg(type)} opacity-80`}
                >
                  <span className="block leading-tight">ORD</span>
                  <span className="block leading-tight text-blue-300">STR</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp: any, idx: number) => {
              const { ord, ot } = getTotals(emp.id);
              return (
                <React.Fragment key={emp.id}>
                  {/* Ordinary row */}
                  <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-1 font-mono text-gray-600 sticky left-0 bg-inherit border-r border-gray-200" rowSpan={2}>
                      {emp.code}
                    </td>
                    <td className="px-2 py-1 font-medium text-gray-900 sticky left-[50px] bg-inherit border-r border-gray-200 whitespace-nowrap" rowSpan={2}>
                      {emp.lastName} {emp.firstName}
                    </td>
                    {days.map(({ day, type }) => {
                      const entry = entryMap[emp.id]?.[day];
                      const isWeekend = type !== 'weekday';
                      const display = entry?.absenceCode
                        ? entry.absenceCode
                        : entry?.ordinaryHours
                        ? String(entry.ordinaryHours)
                        : '';
                      return (
                        <td
                          key={day}
                          onClick={() => isDraft && openEdit(emp.id, day)}
                          className={`px-1 py-1 text-center border-x border-t transition-colors
                            ${isWeekend ? `border-gray-200 ${cellBg(type)}` : 'border-gray-100'}
                            ${isDraft ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}
                            ${entry?.absenceCode ? '!bg-yellow-50 text-yellow-700 font-medium' : ''}
                            ${display && !entry?.absenceCode ? 'text-gray-900' : isWeekend ? 'text-transparent' : 'text-gray-300'}
                          `}
                        >
                          {isWeekend ? (display || '') : (display || '·')}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-semibold text-gray-900 bg-gray-100 border-l border-gray-200 border-t" rowSpan={2}>
                      <div className="flex flex-col gap-0.5">
                        {ord > 0 && <span>{ord}</span>}
                        {ot > 0 && <span className="text-blue-600 text-[10px]">+{ot}</span>}
                      </div>
                    </td>
                  </tr>
                  {/* Overtime row */}
                  <tr key={`${emp.id}-str`} className={idx % 2 === 0 ? 'bg-blue-50/60' : 'bg-blue-50/40'}>
                    {days.map(({ day, type }) => {
                      const entry = entryMap[emp.id]?.[day];
                      const isWeekend = type !== 'weekday';
                      const display = !entry?.absenceCode && Number(entry?.overtimeHours) > 0
                        ? String(entry.overtimeHours)
                        : '';
                      return (
                        <td
                          key={day}
                          onClick={() => isDraft && openEdit(emp.id, day)}
                          className={`px-1 py-0.5 text-center border-x border-b transition-colors text-blue-600 font-medium
                            ${isWeekend ? `border-gray-200 ${cellBg(type)}` : 'border-gray-100'}
                            ${isDraft ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}
                          `}
                        >
                          {display || <span className="text-gray-200 text-[9px]">·</span>}
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={days.length + 3} className="p-6 text-center text-gray-400">
                  Nessun dipendente nel foglio.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Legenda: F=Ferie · M=Malattia · P=Permesso · FE=Festivo · AS=Assente ·{' '}
        <span className="text-blue-500">riga blu = ore straordinarie</span> ·{' '}
        <strong>Click sull'intestazione giorno</strong> per azione rapida su tutta la colonna
      </p>

      {/* Column context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[190px]"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 210), top: contextMenu.y }}
        >
          <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 mb-1">
            Giorno {contextMenu.day} — tutta la colonna
          </p>
          {QUICK_ACTIONS.map((action, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
              onClick={() => applyBulkAction(contextMenu.day, action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Edit cell modal */}
      {editCell && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-sm">
            <h2 className="text-base font-semibold mb-1">
              Giorno {editCell.day} —{' '}
              {employees.find((e) => e.id === editCell.empId)?.lastName}{' '}
              {employees.find((e) => e.id === editCell.empId)?.firstName}
            </h2>
            {days.find((d) => d.day === editCell.day)?.type !== 'weekday' && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 mb-3">
                {days.find((d) => d.day === editCell.day)?.type === 'saturday' ? 'Sabato' : 'Domenica'} — inserimento straordinario
              </p>
            )}
            <div className="space-y-3 mt-3">
              <div>
                <label className="label">Codice assenza</label>
                <select
                  className="input"
                  value={form.absenceCode || ''}
                  onChange={(e) => setForm({ ...form, absenceCode: e.target.value, ordinaryHours: undefined, overtimeHours: undefined })}
                >
                  <option value="">-- Nessuna assenza --</option>
                  {ABSENCE_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
                  ))}
                </select>
              </div>
              {!form.absenceCode && (
                <>
                  <div>
                    <label className="label">Ore ordinarie</label>
                    <input
                      type="number"
                      className="input"
                      min={0}
                      max={24}
                      step={0.5}
                      value={form.ordinaryHours ?? ''}
                      onChange={(e) => setForm({ ...form, ordinaryHours: e.target.value ? +e.target.value : undefined })}
                    />
                  </div>
                  <div>
                    <label className="label">Ore straordinarie</label>
                    <input
                      type="number"
                      className="input"
                      min={0}
                      max={24}
                      step={0.5}
                      value={form.overtimeHours ?? ''}
                      onChange={(e) => setForm({ ...form, overtimeHours: e.target.value ? +e.target.value : undefined })}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button className="btn-secondary flex-1" onClick={() => setEditCell(null)}>
                Annulla
              </button>
              <button className="btn-primary flex-1" onClick={saveEntry} disabled={saving}>
                {saving ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
