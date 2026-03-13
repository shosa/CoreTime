'use client';

import { useEffect, useState } from 'react';
import { usersApi } from '@/lib/api';
import { User, UserRole } from '@/types';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Amministratore' },
  { value: 'hr', label: 'Responsabile Paghe' },
  { value: 'supervisor', label: 'Supervisore Reparto' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', role: 'supervisor' as UserRole });
  const [saving, setSaving] = useState(false);

  const load = () => usersApi.list().then(setUsers).catch(() => {});
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditUser(null); setForm({ email: '', password: '', firstName: '', lastName: '', role: 'supervisor' }); setShowModal(true); };
  const openEdit = (u: User) => { setEditUser(u); setForm({ email: u.email, password: '', firstName: u.firstName, lastName: u.lastName, role: u.role }); setShowModal(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data: any = { ...form };
      if (!data.password) delete data.password;
      if (editUser) await usersApi.update(editUser.id, data);
      else await usersApi.create(data);
      setShowModal(false);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Errore');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Utenti</h1>
        <button className="btn-primary" onClick={openCreate}>+ Nuovo Utente</button>
      </div>

      <div className="card divide-y divide-gray-100">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium text-sm">
                {u.firstName[0]}{u.lastName[0]}
              </div>
              <div>
                <p className="font-medium text-gray-900">{u.lastName} {u.firstName}</p>
                <p className="text-sm text-gray-500">{u.email} · {ROLES.find((r) => r.value === u.role)?.label}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!u.isActive && <span className="badge bg-red-100 text-red-700">Inattivo</span>}
              <button className="btn-secondary text-xs" onClick={() => openEdit(u)}>Modifica</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">{editUser ? 'Modifica Utente' : 'Nuovo Utente'}</h2>
            <form onSubmit={handleSave} className="space-y-3">
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
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="label">{editUser ? 'Nuova Password (lascia vuoto per non cambiare)' : 'Password'}</label>
                <input type="password" className="input" required={!editUser} minLength={6} value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div>
                <label className="label">Ruolo</label>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowModal(false)}>Annulla</button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
