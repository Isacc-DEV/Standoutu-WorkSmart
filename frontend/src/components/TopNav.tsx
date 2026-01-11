'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAuth } from '../lib/auth';
import { api, API_BASE } from '../lib/api';
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

const MAX_BADGE_COUNT = 99;
const BADGE_COLOR = '#f43f5e';
const BADGE_TEXT_COLOR = '#ffffff';
const DOT_BORDER_COLOR = '#ffffff';

type DesktopBridge = {
  isElectron?: boolean;
  setAppBadge?: (count: number, badgeDataUrl?: string | null) => Promise<void> | void;
};

function formatBadgeText(count: number) {
  return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count);
}

function stripBadgePrefix(title: string) {
  return title.replace(/^\(\d+\+?\)\s*/, '');
}

function getDesktopBridge() {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { smartwork?: DesktopBridge }).smartwork;
}

function getFaviconLinks() {
  if (typeof document === 'undefined') return [];
  return Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']"));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load icon'));
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawDotBadge(ctx: CanvasRenderingContext2D, size: number) {
  const radius = Math.round(size * 0.18);
  const offset = Math.round(size * 0.08);
  const border = Math.max(1, Math.round(size * 0.04));
  const cx = size - radius - offset;
  const cy = radius + offset;
  ctx.beginPath();
  ctx.fillStyle = DOT_BORDER_COLOR;
  ctx.arc(cx, cy, radius + border, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = BADGE_COLOR;
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

async function createBadgedFavicon(baseHref: string, count: number) {
  if (count <= 0) return baseHref;
  try {
    const image = await loadImage(baseHref);
    const naturalSize = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
    const size = naturalSize >= 64 ? 64 : naturalSize || 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return baseHref;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    drawDotBadge(ctx, size);
    return canvas.toDataURL('image/png');
  } catch {
    return baseHref;
  }
}

async function createOverlayBadge(count: number) {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const text = formatBadgeText(count);
  const badgeHeight = Math.round(size * 0.8);
  const fontSize = Math.round(size * 0.6);
  const padding = Math.round(size * 0.28);
  ctx.font = `700 ${fontSize}px Arial, sans-serif`;
  const textWidth = ctx.measureText(text).width;
  const badgeWidth = Math.max(badgeHeight, Math.round(textWidth + padding));
  const x = Math.round((size - badgeWidth) / 2);
  const y = Math.round((size - badgeHeight) / 2);
  drawRoundedRect(ctx, x, y, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.fillStyle = BADGE_COLOR;
  ctx.fill();
  ctx.fillStyle = BADGE_TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + badgeWidth / 2, y + badgeHeight / 2);
  return canvas.toDataURL('image/png');
}

function useNotificationBadges(count: number) {
  const faviconRequestRef = useRef(0);
  const overlayRequestRef = useRef(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const cleaned = stripBadgePrefix(document.title || 'SmartWork');
    if (document.title !== cleaned) {
      document.title = cleaned;
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const links = getFaviconLinks();
    if (!links.length) return;
    const requestId = ++faviconRequestRef.current;
    if (count <= 0) {
      links.forEach((link) => {
        const stored = link.getAttribute('data-smartwork-base-href');
        const baseHref = stored || link.href;
        if (!stored) {
          link.setAttribute('data-smartwork-base-href', baseHref);
        }
        if (link.href !== baseHref) {
          link.href = baseHref;
        }
      });
      return;
    }
    void Promise.all(
      links.map(async (link) => {
        const stored = link.getAttribute('data-smartwork-base-href');
        const baseHref = stored || link.href;
        if (!stored) {
          link.setAttribute('data-smartwork-base-href', baseHref);
        }
        const href = await createBadgedFavicon(baseHref, count);
        return { link, href };
      }),
    ).then((results) => {
      if (faviconRequestRef.current !== requestId) return;
      results.forEach(({ link, href }) => {
        if (href && link.href !== href) {
          link.href = href;
          link.type = 'image/png';
        }
      });
    });
  }, [count]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const badgeNavigator = navigator as Navigator & {
      setAppBadge?: (value: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (badgeNavigator.setAppBadge) {
      if (count > 0) {
        void badgeNavigator.setAppBadge(count);
      } else if (badgeNavigator.clearAppBadge) {
        void badgeNavigator.clearAppBadge();
      }
    }

    const bridge = getDesktopBridge();
    if (!bridge?.setAppBadge) return;
    const requestId = ++overlayRequestRef.current;
    if (count <= 0) {
      void bridge.setAppBadge(0, null);
      return;
    }
    void createOverlayBadge(count).then((dataUrl) => {
      if (overlayRequestRef.current !== requestId) return;
      void bridge.setAppBadge(count, dataUrl);
    });
  }, [count]);
}

const emptyNotifications = {
  home: 0,
  workspace: 0,
  community: 0,
  calendar: 0,
  tasks: 0,
  reports: 0,
  system: 0,
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

function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!base) return path;
  return new URL(path, base).toString();
}

async function safeFetchJson<T>(path: string, token?: string | null): Promise<T | null> {
  const url = buildApiUrl(path);
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
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
  const reportsHref = isManager ? '/admin/reports' : '/reports';
  const reportsActive =
    pathname.startsWith('/reports') || pathname.startsWith('/admin/reports');
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

  useNotificationBadges(totalNotifications);

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
        const [communityData, reportData] = await Promise.all([
          safeFetchJson<{ unreads?: { threadId: string; unreadCount: number }[] }>(
            '/community/unread-summary',
            token,
          ),
          safeFetchJson<{ reportCount?: number; systemCount?: number }>(reportUrl, token),
        ]);
        let communityTotal: number | null = null;
        if (communityData) {
          communityTotal = (communityData.unreads ?? []).reduce(
            (sum, info) => sum + (typeof info.unreadCount === 'number' ? info.unreadCount : 0),
            0,
          );
        }
        let reportCount: number | null = null;
        let systemCount: number | null = null;
        if (reportData) {
          reportCount =
            typeof reportData.reportCount === 'number' ? reportData.reportCount : 0;
          systemCount =
            typeof reportData.systemCount === 'number' ? reportData.systemCount : 0;
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
            href="/job-links"
            label="Job links"
            active={pathname.startsWith('/job-links')}
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
            href="/tasks"
            label="Tasks"
            active={pathname.startsWith('/tasks')}
            notificationCount={navNotifications.tasks}
          />
          <NavItem
            href={reportsHref}
            label="Reports"
            active={reportsActive}
            notificationCount={navNotifications.reports}
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

