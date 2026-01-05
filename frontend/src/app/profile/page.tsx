'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TopNav from '../../components/TopNav';
import { useAuth } from '../../lib/useAuth';

function getInitials(name?: string | null) {
  if (!name) return 'DM';
  return name
    .split(' ')
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      router.replace('/auth');
    }
  }, [loading, user, token, router]);

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50">
        <TopNav />
        <div className="mx-auto max-w-4xl px-6 py-12">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            Loading profile...
          </div>
        </div>
      </main>
    );
  }

  const avatarUrl = user.avatarUrl?.trim();
  const hasAvatar = Boolean(avatarUrl) && avatarUrl?.toLowerCase() !== 'nope';
  const initials = getInitials(user.name);

  return (
    <main className="min-h-screen bg-slate-50">
      <TopNav />
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-sm font-semibold text-white">
                {hasAvatar ? (
                  <img src={avatarUrl} alt={`${user.name} avatar`} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Profile</p>
                <h1 className="text-2xl font-semibold text-slate-900">{user.name}</h1>
                <p className="mt-1 text-sm text-slate-600">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {user.role}
              </span>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Account</p>
              <div className="mt-2 text-sm text-slate-700">
                Logged in as <span className="font-semibold text-slate-900">{user.email}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Access</p>
              <div className="mt-2 text-sm text-slate-700">
                Role <span className="font-semibold text-slate-900">{user.role}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
