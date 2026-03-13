'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { useAuthStore } from '@/store/authStore';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuthStore();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (hydrated && (!token || !user)) router.replace('/login');
  }, [hydrated, token, user, router]);

  if (!hydrated) return null;
  if (!token || !user) return null;

  return <DashboardLayout>{children}</DashboardLayout>;
}
