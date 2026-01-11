'use client';

import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { isApiNetworkError } from '../lib/api';

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const original = console.error;
    console.error = (...args: unknown[]) => {
      if (args.some(isApiNetworkError)) return;
      if (
        args.some(
          (arg) =>
            typeof arg === 'string' && arg.startsWith('Network error contacting API'),
        )
      ) {
        return;
      }
      original(...args);
    };
    return () => {
      console.error = original;
    };
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}
