'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAuth } from '../lib/auth';
import { api } from '../lib/api';
import { getReportsLastSeen, subscribeNotificationRefresh, triggerNotificationRefresh } from '../lib/notifications';
import { useAuth } from '../lib/useAuth';

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

function formatNotificationCount(count: number) {
  return String(count);
}

const emptyNotifications = {
  home: 0,
  workspace: 0,
  community: 0,
  calendar: 0,
  reports: 0,
  system: 0,
  about: 0,
  career: 0,
  manager: 0,
  admin: 0,
};

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

function NotificationBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={`absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white shadow-sm ring-2 ring-[#0b1020] ${className || ''}`}
    >
      {formatNotificationCount(count)}
    </span>
  );
}

function NavItem({
  href,
  label,
  active,
  notificationCount,
}: {
  href: string;
  label: string;
  active: boolean;
  notificationCount?: number;
}) {
  const count = notificationCount ?? 0;
  return (
    <Link
      href={href}
      className={`relative rounded-full px-3 py-2 text-sm transition ${
        active ? 'bg-white/10 text-white' : 'text-slate-200 hover:text-white'
      }`}
    >
      {label}
      {count > 0 && (
        <>
          <NotificationBadge count={count} className="-right-1 -top-1" />
          <span className="sr-only">, {formatNotificationCount(count)} new notifications</span>
        </>
      )}
    </Link>
  );
}
export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token } = useAuth();

  const signOut = () => {
    clearAuth();
    router.push('/auth');
  };

  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'MANAGER' || isAdmin;
  const reportsHref = '/reports';
  const reportsActive = pathname.startsWith('/reports');
  const [navNotifications, setNavNotifications] = useState({ ...emptyNotifications });
  const avatarUrl = user?.avatarUrl?.trim();
  const hasAvatar = Boolean(avatarUrl) && avatarUrl?.toLowerCase() !== 'nope';
  const initials = getInitials(user?.name);
  const totalNotifications = Object.values(navNotifications).reduce((sum, value) => sum + value, 0);
  const hasNotifications = totalNotifications > 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState('');
  const [inboxItems, setInboxItems] = useState<NotificationItem[]>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setInboxOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, []);

  const loadInbox = async () => {
    if (!token || !user) return;
    setInboxLoading(true);
    setInboxError('');
    try {
      const isReviewer = user.role === 'ADMIN' || user.role === 'MANAGER';
      const reportSince = !isReviewer ? getReportsLastSeen(user.id, user.role) : null;
      const qs = reportSince ? `?since=${encodeURIComponent(reportSince)}` : '';
      const data = await api<{ notifications?: NotificationItem[] }>(`/notifications/list${qs}`, undefined, token);
      setInboxItems(Array.isArray(data?.notifications) ? data.notifications : []);
      triggerNotificationRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load notifications.';
      setInboxError(message);
    } finally {
      setInboxLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !user) {
      setNavNotifications({ ...emptyNotifications });
      return;
    }
    let active = true;
    let loading = false;
    const refreshIntervalMs = 30000;
    const loadNavNotifications = async () => {
      if (loading) return;
      loading = true;
      try {
        const isReviewer = user.role === 'ADMIN' || user.role === 'MANAGER';
        const reportSince = !isReviewer ? getReportsLastSeen(user.id, user.role) : null;
        const reportUrl = reportSince
          ? `/notifications/summary?since=${encodeURIComponent(reportSince)}`
          : '/notifications/summary';
        const [communityResult, reportResult] = await Promise.allSettled([
          api<{ unreads?: { threadId: string; unreadCount: number }[] }>(
            '/community/unread-summary',
            undefined,
            token,
          ),
          api<{ reportCount?: number }>(reportUrl, undefined, token),
        ]);
        let communityTotal: number | null = null;
        if (communityResult.status === 'fulfilled') {
          communityTotal = (communityResult.value?.unreads ?? []).reduce(
            (sum, info) => sum + (typeof info.unreadCount === 'number' ? info.unreadCount : 0),
            0,
          );
        } else {
          console.error(communityResult.reason);
        }
        let reportCount: number | null = null;
        let systemCount: number | null = null;
        if (reportResult.status === 'fulfilled') {
          reportCount =
            typeof reportResult.value?.reportCount === 'number' ? reportResult.value.reportCount : 0;
          systemCount =
            typeof reportResult.value?.systemCount === 'number' ? reportResult.value.systemCount : 0;
        } else {
          console.error(reportResult.reason);
        }
        if (!active) return;
        setNavNotifications((prev) => ({
          ...prev,
          ...(communityTotal !== null ? { community: communityTotal } : {}),
          ...(reportCount !== null ? { reports: reportCount } : {}),
          ...(systemCount !== null ? { system: systemCount } : {}),
        }));
      } finally {
        loading = false;
      }
    };
    loadNavNotifications();
    const intervalId = window.setInterval(loadNavNotifications, refreshIntervalMs);
    const handleFocus = () => {
      loadNavNotifications();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadNavNotifications();
      }
    };
    const unsubscribe = subscribeNotificationRefresh(() => {
      loadNavNotifications();
    });
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribe();
    };
  }, [token, user]);

  return (
    <header className="relative z-[1000] w-full border-b border-white/5 bg-[#0b1020] backdrop-blur">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 py-3 text-sm">
        <div className="text-lg font-semibold text-white">
          <Link href="/">SmartWork</Link>
        </div>
        <nav className="flex items-center gap-2">
          <NavItem href="/" label="Home" active={pathname === '/'} notificationCount={navNotifications.home} />
          <NavItem
            href="/workspace"
            label="Workspace"
            active={pathname.startsWith('/workspace')}
            notificationCount={navNotifications.workspace}
          />
          <NavItem
            href="/community"
            label="Community"
            active={pathname.startsWith('/community')}
            notificationCount={navNotifications.community}
          />
          <NavItem
            href="/calendar"
            label="Calendar"
            active={pathname.startsWith('/calendar')}
            notificationCount={navNotifications.calendar}
          />
          <NavItem
            href={reportsHref}
            label="Reports"
            active={reportsActive}
            notificationCount={navNotifications.reports}
          />
          <NavItem
            href="/about"
            label="About"
            active={pathname.startsWith('/about')}
            notificationCount={navNotifications.about}
          />
          <NavItem
            href="/career"
            label="Career"
            active={pathname.startsWith('/career')}
            notificationCount={navNotifications.career}
          />
          {isManager && (
            <NavItem
              href="/manager/profiles"
              label="Manager"
              active={pathname.startsWith('/manager')}
              notificationCount={navNotifications.manager}
            />
          )}
          {isAdmin && (
            <NavItem
              href="/admin/users"
              label="Admin"
              active={pathname.startsWith('/admin')}
              notificationCount={navNotifications.admin}
            />
          )}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <div className="relative flex items-center gap-2" ref={menuRef}>
              <button
                type="button"
                onClick={() => {
                  setInboxOpen((prev) => !prev);
                  if (!inboxOpen) {
                    void loadInbox();
                  }
                }}
                aria-label="Open notifications inbox"
                className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 7h16" />
                  <path d="M4 7l2 11h12l2-11" />
                  <path d="M9 10h6" />
                </svg>
                {hasNotifications && (
                  <NotificationBadge count={totalNotifications} className="-right-1 -top-1" />
                )}
              </button>
              {inboxOpen && (
                <div className="absolute right-10 top-full z-50 mt-2 w-80 rounded-2xl border border-white/10 bg-[#0b1020] p-3 text-xs text-white shadow-2xl">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                    Notifications
                  </div>
                  {inboxError ? (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-200">
                      {inboxError}
                    </div>
                  ) : null}
                  {inboxLoading ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-300">
                      Loading notifications...
                    </div>
                  ) : null}
                  {!inboxLoading && inboxItems.length === 0 && !inboxError ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-300">
                      No new notifications.
                    </div>
                  ) : null}
                  <div className="max-h-72 space-y-2 overflow-auto pr-1">
                    {inboxItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (item.href) {
                            router.push(item.href);
                          }
                          setInboxOpen(false);
                        }}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-slate-100 transition hover:border-white/20 hover:bg-white/10"
                      >
                        <div className="text-sm font-semibold text-white">{item.message}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                          {item.kind === 'community'
                            ? 'Community'
                            : item.kind === 'report'
                            ? 'Reports'
                            : 'System'}{' '}
                          · {formatRelativeTime(item.createdAt)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="relative flex items-center rounded-full bg-white/10 p-1 text-xs text-white transition hover:bg-white/20"
              >
                <span className="relative flex h-7 w-7 items-center justify-center">
                  <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white/15 text-[9px] font-semibold text-white">
                    {hasAvatar ? (
                      <img src={avatarUrl} alt={`${user.name} avatar`} className="h-full w-full object-cover" />
                    ) : (
                      initials
                    )}
                  </span>
                </span>
                {hasNotifications && (
                  <span className="sr-only">{formatNotificationCount(totalNotifications)} new notifications</span>
                )}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-2xl border border-white/10 bg-[#0b1020] p-1 text-xs text-slate-100 shadow-2xl">
                  <Link
                    href="/profile"
                    className="block rounded-lg px-3 py-2 transition hover:bg-white/10"
                  >
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={signOut}
                    className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-white/10"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/auth"
              className="rounded-full bg-[#4ade80] px-4 py-2 text-xs font-semibold text-[#0b1224] shadow-[0_10px_30px_-18px_rgba(74,222,128,0.8)] hover:brightness-110"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

