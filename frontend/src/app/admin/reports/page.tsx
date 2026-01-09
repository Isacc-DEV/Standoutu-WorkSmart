'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminReportsView from '../../reports/AdminReportsView';
import TopNav from '../../../components/TopNav';
import { useAuth } from '../../../lib/useAuth';

export default function AdminReportsPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const canReview = user?.role === 'ADMIN';

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      router.replace('/auth');
      return;
    }
    if (!canReview) {
      router.replace('/reports');
    }
  }, [loading, user, token, canReview, router]);

  if (loading || !user || !token || !canReview) {
    return null;
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <TopNav />
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-6">
        <AdminReportsView token={token} />
      </div>
    </main>
  );
}
