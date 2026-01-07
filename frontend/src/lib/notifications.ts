const REPORTS_LAST_SEEN_KEY = 'smartwork_reports_last_seen';
const NOTIFICATION_REFRESH_EVENT = 'smartwork-notifications-refresh';

function buildReportsLastSeenKey(userId: string, role: string) {
  return `${REPORTS_LAST_SEEN_KEY}:${userId}:${role.toLowerCase()}`;
}

export function getReportsLastSeen(userId: string, role: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(buildReportsLastSeenKey(userId, role));
}

export function setReportsLastSeen(userId: string, role: string, value?: string) {
  if (typeof window === 'undefined') return;
  const timestamp = value ?? new Date().toISOString();
  window.localStorage.setItem(buildReportsLastSeenKey(userId, role), timestamp);
  window.dispatchEvent(new Event(NOTIFICATION_REFRESH_EVENT));
}

export function triggerNotificationRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATION_REFRESH_EVENT));
}

export function subscribeNotificationRefresh(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(NOTIFICATION_REFRESH_EVENT, callback);
  return () => window.removeEventListener(NOTIFICATION_REFRESH_EVENT, callback);
}
