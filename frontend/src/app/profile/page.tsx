'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import TopNav from '../../components/TopNav';
import { api } from '../../lib/api';
import { type ClientUser, saveAuth } from '../../lib/auth';
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

function normalizeUploadError(err: unknown) {
  const fallback = 'Upload failed. Please try again.';
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    if (parsed?.message) return parsed.message;
  } catch {
    // ignore JSON parse errors
  }
  return raw;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [tempAvatarUrl, setTempAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      router.replace('/auth');
    }
  }, [loading, user, token, router]);

  useEffect(() => {
    return () => {
      if (tempAvatarUrl) URL.revokeObjectURL(tempAvatarUrl);
    };
  }, [tempAvatarUrl]);

  const handleAvatarPick = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError('');
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Please choose a JPG, PNG, GIF, or WEBP image.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image is too large. Max 5MB.');
      event.target.value = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setTempAvatarUrl(previewUrl);

    if (!user || !token) {
      setUploadError('Please sign in again to update your avatar.');
      setTempAvatarUrl(null);
      event.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);
      const res = await api(
        '/users/me/avatar',
        { method: 'POST', body: formData },
        token,
      );
      const payload = res as { user?: ClientUser; avatarUrl?: string };
      const updatedUser =
        payload.user ??
        (payload.avatarUrl
          ? { ...user, avatarUrl: payload.avatarUrl }
          : user);
      if (updatedUser && token) {
        saveAuth(updatedUser, token);
      }
      setTempAvatarUrl(null);
    } catch (err) {
      setUploadError(normalizeUploadError(err));
      setTempAvatarUrl(null);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

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
  const displayAvatarUrl = tempAvatarUrl ?? avatarUrl;
  const hasAvatar =
    Boolean(displayAvatarUrl) && displayAvatarUrl?.toLowerCase() !== 'nope';
  const initials = getInitials(user.name);

  return (
    <main className="min-h-screen bg-slate-50">
      <TopNav />
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleAvatarPick}
                  disabled={uploading}
                  className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-sm font-semibold text-white shadow-sm ring-1 ring-slate-200 transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-wait disabled:opacity-80"
                  aria-label="Upload new avatar"
                >
                  {hasAvatar ? (
                    <img
                      src={displayAvatarUrl}
                      alt={`${user.name} avatar`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                  <span
                    className={`absolute inset-0 flex items-center justify-center bg-slate-900/65 text-white backdrop-blur-sm transition ${
                      uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {uploading ? (
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 7h3l2-2h6l2 2h3v12H4z" />
                        <circle cx="12" cy="13" r="3.5" />
                      </svg>
                    )}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleAvatarChange}
                  className="hidden"
                  disabled={uploading}
                />
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {uploading ? 'Uploading...' : 'Change photo'}
                </div>
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

          {uploadError && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {uploadError}
            </div>
          )}

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
