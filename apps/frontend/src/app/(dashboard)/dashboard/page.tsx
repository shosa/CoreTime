'use client';

import { useEffect, useState } from 'react';
import { sheetsApi } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { MONTH_NAMES, AttendanceSheet, SHEET_STATUS_LABELS } from '@/types';
import Link from 'next/link';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [recentSheets, setRecentSheets] = useState<AttendanceSheet[]>([]);
  const now = new Date();

  useEffect(() => {
    sheetsApi.list({ year: now.getFullYear(), month: now.getMonth() + 1 })
      .then(setRecentSheets)
      .catch(() => {});
  }, []);

  const monthName = MONTH_NAMES[now.getMonth()];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Benvenuto, {user?.firstName}</h1>
        <p className="text-gray-500 mt-1">{monthName} {now.getFullYear()}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-sm text-gray-500">Fogli del mese</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{recentSheets.length}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">In bozza</p>
          <p className="text-3xl font-bold text-yellow-600 mt-1">
            {recentSheets.filter((s) => s.status === 'draft').length}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">Inviati</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">
            {recentSheets.filter((s) => s.status === 'submitted').length}
          </p>
        </div>
      </div>

      {/* Fogli del mese corrente */}
      <div className="card">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Fogli {monthName} {now.getFullYear()}</h2>
          <Link href="/sheets" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Vedi tutti →
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {recentSheets.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">Nessun foglio per il mese corrente.</p>
          ) : (
            recentSheets.map((sheet) => (
              <Link
                key={sheet.id}
                href={`/sheets/${sheet.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900">{sheet.department.name}</p>
                  <p className="text-sm text-gray-500">
                    {MONTH_NAMES[sheet.month - 1]} {sheet.year}
                  </p>
                </div>
                <span className={`badge-${sheet.status}`}>
                  {SHEET_STATUS_LABELS[sheet.status]}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
