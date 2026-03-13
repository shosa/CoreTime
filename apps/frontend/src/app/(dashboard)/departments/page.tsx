'use client';

import { useEffect, useState } from 'react';
import { departmentsApi } from '@/lib/api';
import { Department } from '@/types';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [form, setForm] = useState({ code: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Department | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const load = () => departmentsApi.list(showAll).then(setDepartments).catch(() => {});
  useEffect(() => { load(); }, [showAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => { setEditDept(null); setForm({ code: '', name: '' }); setShowModal(true); };
  const openEdit = (d: Department) => { setEditDept(d); setForm({ code: d.code, name: d.name }); setShowModal(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editDept) await departmentsApi.update(editDept.id, form);
      else await departmentsApi.create(form);
      setShowModal(false);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Errore');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (d: Department) => {
    try {
      if (d.isActive) await departmentsApi.disable(d.id);
      else await departmentsApi.enable(d.id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Errore');
    }
  };

  const handleDelete = async (d: Department) => {
    setDeleteError('');
    try {
      await departmentsApi.remove(d.id);
      setConfirmDelete(null);
      load();
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || 'Errore durante la cancellazione');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Reparti</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="rounded" />
            Mostra disabilitati
          </label>
          <button className="btn-primary" onClick={openCreate}>+ Nuovo Reparto</button>
        </div>
      </div>

      <div className="card divide-y divide-gray-100">
        {departments.length === 0 ? (
          <p className="p-5 text-sm text-gray-400">Nessun reparto trovato.</p>
        ) : (
          departments.map((d) => (
            <div key={d.id} className={`flex items-center justify-between p-4 hover:bg-gray-50 ${!d.isActive ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{d.code}</span>
                <p className="font-medium text-gray-900">{d.name}</p>
                {!d.isActive && <span className="badge bg-red-100 text-red-700">Disabilitato</span>}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-secondary text-xs" onClick={() => openEdit(d)}>Modifica</button>
                <button
                  className={`btn text-xs border ${d.isActive ? 'border-yellow-300 text-yellow-700 hover:bg-yellow-50' : 'border-green-300 text-green-700 hover:bg-green-50'}`}
                  onClick={() => handleToggle(d)}
                >
                  {d.isActive ? 'Disabilita' : 'Abilita'}
                </button>
                <button className="btn-danger text-xs" onClick={() => { setDeleteError(''); setConfirmDelete(d); }}>
                  Elimina
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-4">{editDept ? 'Modifica Reparto' : 'Nuovo Reparto'}</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">Codice</label>
                <input className="input" required maxLength={20} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div>
                <label className="label">Nome Reparto</label>
                <input className="input" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
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
            <h2 className="text-lg font-semibold text-red-700 mb-2">Elimina Reparto</h2>
            <p className="text-sm text-gray-700 mb-2">
              Vuoi eliminare il reparto <strong>{confirmDelete.name}</strong>?
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Bloccato se ha fogli presenze associati o dipendenti attivi. Usa &quot;Disabilita&quot; in quel caso.
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
