'use client';

import { useEffect, useState, useCallback } from 'react';
import { sheetsApi, departmentsApi } from '@/lib/api';
import { AttendanceSheet, Department, MONTH_NAMES, SHEET_STATUS_LABELS } from '@/types';
import Link from 'next/link';

interface SimpleEmployee {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

export default function SheetsPage() {
  const [sheets, setSheets] = useState<AttendanceSheet[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filterYear, setFilterYear] = useState(CURRENT_YEAR);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);

  // Wizard state
  const [step, setStep] = useState<1 | 2>(1);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    departmentId: '',
    year: CURRENT_YEAR,
    month: new Date().getMonth() + 1,
  });

  // Step 2 — selezione dipendenti
  const [available, setAvailable] = useState<SimpleEmployee[]>([]);
  const [assigned, setAssigned] = useState<SimpleEmployee[]>([]);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [saving, setSaving] = useState(false);

  // Ricerca nelle colonne dipendenti
  const [searchAvailable, setSearchAvailable] = useState('');
  const [searchAssigned, setSearchAssigned] = useState('');

  // Drag state
  const [dragging, setDragging] = useState<{ emp: SimpleEmployee; from: 'available' | 'assigned' } | null>(null);
  const [dragOver, setDragOver] = useState<'available' | 'assigned' | null>(null);

  const load = useCallback(() =>
    sheetsApi.list({ year: filterYear, month: filterMonth }).then(setSheets).catch(() => {}),
    [filterYear, filterMonth]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { departmentsApi.list().then(setDepartments).catch(() => {}); }, []);

  const openCreate = () => {
    setStep(1);
    setCreateForm({ departmentId: '', year: CURRENT_YEAR, month: new Date().getMonth() + 1 });
    setAvailable([]);
    setAssigned([]);
    setHasPrevious(false);
    setSearchAvailable('');
    setSearchAssigned('');
    setShowCreate(true);
  };

  const goToStep2 = async () => {
    if (!createForm.departmentId) return;
    setLoadingSuggestion(true);
    try {
      const res = await sheetsApi.getEmployeesSuggestion(createForm.departmentId, createForm.year, createForm.month);
      setAvailable(res.available);
      setAssigned(res.suggested);
      setHasPrevious(res.hasPrevious);
      setStep(2);
    } catch {
      alert('Errore nel caricamento dipendenti');
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const loadPreviousMonth = async () => {
    setLoadingSuggestion(true);
    try {
      const res = await sheetsApi.getEmployeesSuggestion(createForm.departmentId, createForm.year, createForm.month);
      setAvailable(res.available);
      setAssigned(res.suggested);
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const moveToAssigned = (emp: SimpleEmployee) => {
    setAvailable((a) => a.filter((e) => e.id !== emp.id));
    setAssigned((a) => [...a, emp].sort((x, y) => x.lastName.localeCompare(y.lastName)));
  };

  const moveToAvailable = (emp: SimpleEmployee) => {
    setAssigned((a) => a.filter((e) => e.id !== emp.id));
    setAvailable((a) => [...a, emp].sort((x, y) => x.lastName.localeCompare(y.lastName)));
  };

  // Drag handlers
  const onDragStart = (emp: SimpleEmployee, from: 'available' | 'assigned') => {
    setDragging({ emp, from });
  };

  const onDrop = (to: 'available' | 'assigned') => {
    if (!dragging || dragging.from === to) return;
    if (to === 'assigned') moveToAssigned(dragging.emp);
    else moveToAvailable(dragging.emp);
    setDragging(null);
    setDragOver(null);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await sheetsApi.create({
        ...createForm,
        employeeIds: assigned.map((e) => e.id),
      });
      setShowCreate(false);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Errore nella creazione');
    } finally {
      setSaving(false);
    }
  };

  const deptName = departments.find((d) => d.id === createForm.departmentId)?.name;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Fogli Presenze</h1>
        <button className="btn-primary" onClick={openCreate}>+ Nuovo Foglio</button>
      </div>

      {/* Filtri */}
      <div className="card p-4 flex flex-wrap gap-3">
        <select className="input w-auto" value={filterYear} onChange={(e) => setFilterYear(+e.target.value)}>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="input w-auto" value={filterMonth} onChange={(e) => setFilterMonth(+e.target.value)}>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className="card divide-y divide-gray-100">
        {sheets.length === 0 ? (
          <p className="p-5 text-sm text-gray-400">Nessun foglio trovato.</p>
        ) : (
          sheets.map((sheet) => (
            <Link
              key={sheet.id}
              href={`/sheets/${sheet.id}`}
              className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="font-medium text-gray-900">{sheet.department.name}</p>
                <p className="text-sm text-gray-500">{MONTH_NAMES[sheet.month - 1]} {sheet.year}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className={`badge-${sheet.status}`}>{SHEET_STATUS_LABELS[sheet.status]}</span>
                <span className="text-gray-400 text-sm">→</span>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Modal wizard */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className={`card p-6 w-full ${step === 2 ? 'max-w-3xl' : 'max-w-md'}`}>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-5">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${step === 1 ? 'bg-gray-900 text-white' : 'bg-green-500 text-white'}`}>
                {step === 1 ? '1' : '✓'}
              </div>
              <div className="text-sm font-medium text-gray-700">Reparto e periodo</div>
              <div className="flex-1 h-px bg-gray-200 mx-2" />
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${step === 2 ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
              <div className="text-sm font-medium text-gray-500">Dipendenti</div>
            </div>

            {/* ── Step 1 ── */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Nuovo Foglio Presenze</h2>
                <div>
                  <label className="label">Reparto</label>
                  <select className="input" required value={createForm.departmentId}
                    onChange={(e) => setCreateForm({ ...createForm, departmentId: e.target.value })}>
                    <option value="">Seleziona reparto...</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Anno</label>
                    <select className="input" value={createForm.year}
                      onChange={(e) => setCreateForm({ ...createForm, year: +e.target.value })}>
                      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Mese</label>
                    <select className="input" value={createForm.month}
                      onChange={(e) => setCreateForm({ ...createForm, month: +e.target.value })}>
                      {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" className="btn-secondary flex-1" onClick={() => setShowCreate(false)}>Annulla</button>
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    disabled={!createForm.departmentId || loadingSuggestion}
                    onClick={goToStep2}
                  >
                    {loadingSuggestion ? 'Caricamento...' : 'Avanti →'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2 ── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    Dipendenti — {deptName}, {MONTH_NAMES[createForm.month - 1]} {createForm.year}
                  </h2>
                  {hasPrevious && (
                    <button
                      type="button"
                      className="text-xs border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg px-3 py-1.5 transition-colors"
                      onClick={loadPreviousMonth}
                      disabled={loadingSuggestion}
                    >
                      ↺ Ricarica da mese precedente
                    </button>
                  )}
                </div>

                {hasPrevious && assigned.length > 0 && (
                  <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                    Suggeriti i {assigned.length} dipendenti del mese precedente. Trascina o clicca per modificare.
                  </p>
                )}
                {!hasPrevious && (
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    Nessun foglio nel mese precedente. Seleziona i dipendenti dalla colonna sinistra.
                  </p>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* Disponibili */}
                  <div
                    className={`rounded-xl border-2 transition-colors ${dragOver === 'available' ? 'border-gray-400 bg-gray-50' : 'border-gray-200'}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver('available'); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => onDrop('available')}
                  >
                    <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-xl space-y-1.5">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Disponibili ({available.length})
                      </p>
                      <input
                        type="text"
                        placeholder="Cerca..."
                        className="input py-1 text-xs"
                        value={searchAvailable}
                        onChange={(e) => setSearchAvailable(e.target.value)}
                      />
                    </div>
                    <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
                      {available.filter((e) => {
                        const q = searchAvailable.toLowerCase();
                        return !q || `${e.lastName} ${e.firstName} ${e.code}`.toLowerCase().includes(q);
                      }).length === 0 ? (
                        <li className="p-4 text-xs text-gray-400 text-center">Nessuno</li>
                      ) : available.filter((e) => {
                        const q = searchAvailable.toLowerCase();
                        return !q || `${e.lastName} ${e.firstName} ${e.code}`.toLowerCase().includes(q);
                      }).map((emp) => (
                        <li
                          key={emp.id}
                          draggable
                          onDragStart={() => onDragStart(emp, 'available')}
                          onDragEnd={() => setDragging(null)}
                          onClick={() => moveToAssigned(emp)}
                          className="flex items-center justify-between px-3 py-2 hover:bg-blue-50 cursor-pointer select-none group"
                        >
                          <span className="text-sm text-gray-800">
                            <span className="font-mono text-gray-400 text-xs mr-2">{emp.code}</span>
                            {emp.lastName} {emp.firstName}
                          </span>
                          <span className="text-blue-500 opacity-0 group-hover:opacity-100 text-xs">→</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Assegnati */}
                  <div
                    className={`rounded-xl border-2 transition-colors ${dragOver === 'assigned' ? 'border-blue-400 bg-blue-50' : 'border-blue-200'}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver('assigned'); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => onDrop('assigned')}
                  >
                    <div className="px-3 py-2 border-b border-blue-200 bg-blue-50 rounded-t-xl space-y-1.5">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                        Nel foglio ({assigned.length})
                      </p>
                      <input
                        type="text"
                        placeholder="Cerca..."
                        className="input py-1 text-xs"
                        value={searchAssigned}
                        onChange={(e) => setSearchAssigned(e.target.value)}
                      />
                    </div>
                    <ul className="divide-y divide-blue-100 max-h-56 overflow-y-auto">
                      {assigned.filter((e) => {
                        const q = searchAssigned.toLowerCase();
                        return !q || `${e.lastName} ${e.firstName} ${e.code}`.toLowerCase().includes(q);
                      }).length === 0 ? (
                        <li className="p-4 text-xs text-gray-400 text-center">
                          {assigned.length === 0 ? 'Trascina qui i dipendenti' : 'Nessun risultato'}
                        </li>
                      ) : assigned.filter((e) => {
                        const q = searchAssigned.toLowerCase();
                        return !q || `${e.lastName} ${e.firstName} ${e.code}`.toLowerCase().includes(q);
                      }).map((emp) => (
                        <li
                          key={emp.id}
                          draggable
                          onDragStart={() => onDragStart(emp, 'assigned')}
                          onDragEnd={() => setDragging(null)}
                          onClick={() => moveToAvailable(emp)}
                          className="flex items-center justify-between px-3 py-2 hover:bg-red-50 cursor-pointer select-none group"
                        >
                          <span className="text-sm text-gray-800">
                            <span className="font-mono text-gray-400 text-xs mr-2">{emp.code}</span>
                            {emp.lastName} {emp.firstName}
                          </span>
                          <span className="text-red-400 opacity-0 group-hover:opacity-100 text-xs">←</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <p className="text-xs text-gray-400">
                  Trascina o clicca per spostare. I dipendenti nel foglio compaiono già nella griglia.
                </p>

                <div className="flex gap-3 pt-2">
                  <button type="button" className="btn-secondary" onClick={() => setStep(1)}>← Indietro</button>
                  <div className="flex-1" />
                  <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Annulla</button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={saving}
                    onClick={handleCreate}
                  >
                    {saving ? 'Creazione...' : `Crea Foglio${assigned.length > 0 ? ` (${assigned.length} dip.)` : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
