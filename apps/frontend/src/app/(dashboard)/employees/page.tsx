'use client';

import { useEffect, useState } from 'react';
import { employeesApi, departmentsApi } from '@/lib/api';
import { Employee, Department } from '@/types';
export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [form, setForm] = useState({ code: '', firstName: '', lastName: '', hourlyRate: 0, departmentId: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const load = () => employeesApi.list(showAll).then(setEmployees).catch(() => {});
  useEffect(() => { load(); }, [showAll]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { departmentsApi.list().then(setDepartments).catch(() => {}); }, []);

  const openCreate = () => {
    setEditEmp(null);
    setForm({ code: '', firstName: '', lastName: '', hourlyRate: 0, departmentId: '' });
    setShowModal(true);
  };
  const openEdit = (emp: Employee) => {
    setEditEmp(emp);
    const cur = emp.departmentAssignments?.find((a: any) => !a.assignedTo);
    setForm({ code: emp.code, firstName: emp.firstName, lastName: emp.lastName, hourlyRate: Number((emp as any).hourlyRate), departmentId: cur?.departmentId || '' });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editEmp) {
        await employeesApi.update(editEmp.id, { code: form.code, firstName: form.firstName, lastName: form.lastName, hourlyRate: form.hourlyRate });
      } else {
        await employeesApi.create(form);
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Errore');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (emp: Employee) => {
    try {
      if (emp.isActive) await employeesApi.disable(emp.id);
      else await employeesApi.enable(emp.id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Errore');
    }
  };

  const handleDelete = async (emp: Employee) => {
    setDeleteError('');
    try {
      await employeesApi.remove(emp.id);
      setConfirmDelete(null);
      load();
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || 'Errore durante la cancellazione');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Dipendenti</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="rounded" />
            Mostra disabilitati
          </label>
          <button className="btn-primary" onClick={openCreate}>+ Nuovo Dipendente</button>
        </div>
      </div>

      <div className="card divide-y divide-gray-100">
        {employees.length === 0 ? (
          <p className="p-5 text-sm text-gray-400">Nessun dipendente trovato.</p>
        ) : (
          employees.map((emp) => {
            const cur = emp.departmentAssignments?.find((a: any) => !a.assignedTo);
            return (
              <div key={emp.id} className={`flex items-center justify-between p-4 hover:bg-gray-50 ${!emp.isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm text-gray-500 w-14">{emp.code}</span>
                  <div>
                    <p className="font-medium text-gray-900">
                      {emp.lastName} {emp.firstName}
                      {!emp.isActive && <span className="ml-2 badge bg-red-100 text-red-700">Disabilitato</span>}
                    </p>
                    <p className="text-sm text-gray-500">
                      {cur ? (cur as any).department?.name : 'Nessun reparto'} &middot; &euro;{Number((emp as any).hourlyRate).toFixed(2)}/h
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary text-xs" onClick={() => openEdit(emp)}>Modifica</button>
                  <button
                    className={`btn text-xs border ${emp.isActive ? 'border-yellow-300 text-yellow-700 hover:bg-yellow-50' : 'border-green-300 text-green-700 hover:bg-green-50'}`}
                    onClick={() => handleToggle(emp)}
                  >
                    {emp.isActive ? 'Disabilita' : 'Abilita'}
                  </button>
                  <button className="btn-danger text-xs" onClick={() => { setDeleteError(''); setConfirmDelete(emp); }}>
                    Elimina
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">{editEmp ? 'Modifica Dipendente' : 'Nuovo Dipendente'}</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Codice</label>
                  <input className="input" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div>
                  <label className="label">Paga oraria (&euro;)</label>
                  <input type="number" className="input" min={0} step={0.01} required value={form.hourlyRate}
                    onChange={(e) => setForm({ ...form, hourlyRate: +e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Nome</label>
                  <input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="label">Cognome</label>
                  <input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              {!editEmp && (
                <div>
                  <label className="label">Reparto iniziale</label>
                  <select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                    <option value="">Nessuno</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowModal(false)}>Annulla</button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-red-700 mb-2">Elimina Dipendente</h2>
            <p className="text-sm text-gray-700 mb-2">
              Vuoi eliminare <strong>{confirmDelete.lastName} {confirmDelete.firstName}</strong>?
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Se ha presenze registrate la cancellazione viene bloccata. Usa &quot;Disabilita&quot; in quel caso.
            </p>
            {deleteError && <p className="text-sm text-red-600 bg-red-50 rounded p-2 mb-3">{deleteError}</p>}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => { setConfirmDelete(null); setDeleteError(''); }}>Annulla</button>
              <button className="btn-danger flex-1" onClick={() => handleDelete(confirmDelete)}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
