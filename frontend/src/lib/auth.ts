'use client';

export type ClientRole = 'ADMIN' | 'MANAGER' | 'BIDDER' | 'OBSERVER';

export type ClientUser = {
  id: string;
  email: string;
  name: string;
  role: ClientRole;
  avatarUrl?: string | null;
};

type StoredAuth = {
  user: ClientUser;
  token: string;
};

const AUTH_EVENT = 'smartwork-auth';
let cachedAuth: StoredAuth | null = null;
let cachedUserRaw: string | null = null;
let cachedToken: string | null = null;

export function notifyAuthChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function subscribeAuth(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener('storage', handler);
  window.addEventListener(AUTH_EVENT, handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(AUTH_EVENT, handler);
  };
}

export function getAuthSnapshot(): StoredAuth | null {
  if (typeof window === 'undefined') return null;
  const rawUser = window.localStorage.getItem('smartwork_user');
  const token = window.localStorage.getItem('smartwork_token');
  if (rawUser === cachedUserRaw && token === cachedToken) {
    return cachedAuth;
  }
  cachedUserRaw = rawUser;
  cachedToken = token;
  if (!rawUser || !token) {
    cachedAuth = null;
    return null;
  }
  try {
    const user = JSON.parse(rawUser) as ClientUser;
    cachedAuth = { user, token };
    return cachedAuth;
  } catch {
    cachedAuth = null;
    return null;
  }
}

export function readAuth(): StoredAuth | null {
  return getAuthSnapshot();
}

export function saveAuth(user: ClientUser, token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('smartwork_user', JSON.stringify(user));
  window.localStorage.setItem('smartwork_token', token);
  notifyAuthChange();
}

export function clearAuth() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('smartwork_user');
  window.localStorage.removeItem('smartwork_token');
  notifyAuthChange();
}
