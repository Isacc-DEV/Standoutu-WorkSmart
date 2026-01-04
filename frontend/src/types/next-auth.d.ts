import type { DefaultSession } from 'next-auth';
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    primaryAccountId?: string;
    user?: {
      id?: string;
      timeZone?: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    timeZone?: string | null;
  }
}
