'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { clearAuth, getAuthSnapshot, notifyAuthChange, subscribeAuth } from './auth';

export function useAuth() {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, () => null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const user = hydrated ? auth?.user ?? null : null;
  const token = hydrated ? auth?.token ?? null : null;
  const loading = !hydrated;

  const refresh = () => {
    notifyAuthChange();
  };

  const signOut = () => {
    clearAuth();
    if (typeof window !== 'undefined') {
      window.location.href = '/auth';
    }
  };

  return { user, token, loading, refresh, signOut };
}
