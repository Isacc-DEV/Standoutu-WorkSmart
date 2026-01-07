'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TopNav from '../../components/TopNav';
import { api } from '../../lib/api';
import { getReportsLastSeen, setReportsLastSeen, triggerNotificationRefresh } from '../../lib/notifications';
import { useAuth } from '../../lib/useAuth';

type NotificationItem = {
  id: string;
  kind: 'community' | 'report' | 'system';
  message: string;
  createdAt: string;
  href?: string;
};

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const isReviewer = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      router.replace('/auth');
    }
  }, [loading, user, token, router]);

  const fetchNotifications = useCallback(async () => {
    if (!token || !user) return;
    setLoadingList(true);
    setError('');
    try {
      const reportSince = !isReviewer ? getReportsLastSeen(user.id, user.role) : null;
      const qs = reportSince ? `?since=${encodeURIComponent(reportSince)}` : '';
      const data = await api<{ notifications?: NotificationItem[] }>(`/notifications/list${qs}`);
      setItems(Array.isArray(data?.notifications) ? data.notifications : []);
      if (!isReviewer) {
        setReportsLastSeen(user.id, user.role);
      }
      triggerNotificationRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load notifications.';
      setError(message);
    } finally {
      setLoadingList(false);
    }
  }, [token, user, isReviewer]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const emptyState = useMemo(() => {
    if (loadingList) return 'Loading notifications...';
    if (items.length === 0) return 'No new notifications yet.';
    return '';
  }, [loadingList, items.length]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f4f8ff] via-[#eef2ff] to-white text-slate-900">
      <TopNav />
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Notifications</p>
            <h1 className="text-3xl font-semibold text-slate-900">Inbox</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Review updates from community messages and daily reports.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchNotifications}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {emptyState ? (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-white/80 px-5 py-6 text-sm text-slate-500">
            {emptyState}
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="mt-6 space-y-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(item.href || '/reports')}
                className="w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.message}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {item.kind === 'community'
                        ? 'Community'
                        : item.kind === 'report'
                        ? 'Reports'
                        : 'System'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">{formatRelativeTime(item.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
