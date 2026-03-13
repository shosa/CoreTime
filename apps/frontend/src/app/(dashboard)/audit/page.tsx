'use client';

import { useEffect, useState, useCallback } from 'react';
import { auditApi } from '@/lib/api';

const ENTITY_LABELS: Record<string, string> = {
  user: 'Utente',
  department: 'Reparto',
  employee: 'Dipendente',
  sheet: 'Foglio',
  entry: 'Presenza',
};

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  disable: 'bg-yellow-100 text-yellow-800',
  enable: 'bg-teal-100 text-teal-800',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Creazione',
  update: 'Modifica',
  delete: 'Eliminazione',
  disable: 'Disabilitazione',
  enable: 'Abilitazione',
};

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  entityName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; role: string } | null;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ entity: '', userId: '' });
  const [expanded, setExpanded] = useState<string | null>(null);

  const LIMIT = 25;

  const load = useCallback(() => {
    setLoading(true);
    auditApi.list({
      ...(filters.entity && { entity: filters.entity }),
      ...(filters.userId && { userId: filters.userId }),
      limit: LIMIT,
      offset: page * LIMIT,
    })
      .then((res: { logs: AuditLog[]; total: number }) => {
        setLogs(res.logs);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Registro Audit</h1>
        <span className="text-sm text-gray-500">{total} eventi totali</span>
      </div>

      {/* Filtri */}
      <div className="card p-4 flex flex-wrap gap-4">
        <div>
          <label className="label">Entità</label>
          <select className="input w-44" value={filters.entity} onChange={(e) => handleFilterChange('entity', e.target.value)}>
            <option value="">Tutte</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-secondary text-sm" onClick={() => { setFilters({ entity: '', userId: '' }); setPage(0); }}>
            Reset filtri
          </button>
        </div>
      </div>

      {/* Tabella */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Caricamento...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Nessun evento trovato.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Utente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Azione</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Entità</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dettagli</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => (
                <>
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {log.user ? `${log.user.lastName} ${log.user.firstName}` : <span className="text-gray-400 italic">Sistema</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLES[log.action] || 'bg-gray-100 text-gray-700'}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{ENTITY_LABELS[log.entity] || log.entity}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{log.entityName || <span className="text-gray-400 font-mono text-xs">{log.entityId.slice(0, 8)}…</span>}</td>
                    <td className="px-4 py-3">
                      {(log.before || log.after) && (
                        <button
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                        >
                          {expanded === log.id ? 'Chiudi' : 'Vedi diff'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={`${log.id}-diff`} className="bg-gray-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {log.before && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Prima</p>
                              <pre className="text-xs bg-red-50 border border-red-100 rounded p-3 overflow-auto max-h-48 text-red-900 whitespace-pre-wrap">
                                {JSON.stringify(log.before, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.after && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Dopo</p>
                              <pre className="text-xs bg-green-50 border border-green-100 rounded p-3 overflow-auto max-h-48 text-green-900 whitespace-pre-wrap">
                                {JSON.stringify(log.after, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginazione */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Pagina {page + 1} di {totalPages} ({total} eventi)
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ← Precedente
            </button>
            <button className="btn-secondary text-sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Successiva →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
