import { PrismaAdapter } from '@next-auth/prisma-adapter';
import NextAuth, { type NextAuthOptions } from 'next-auth';
import { type JWT } from 'next-auth/jwt';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { prisma } from '@/lib/prisma';

const tenantId = process.env.MS_TENANT_ID || 'common';
const baseScope = 'openid profile email offline_access Calendars.Read User.Read';
const includeSharedCalendars =
  process.env.MS_GRAPH_SHARED_CALENDARS === 'true' ||
  (tenantId !== 'common' && tenantId !== 'consumers');
const scope = includeSharedCalendars ? `${baseScope} Calendars.Read.Shared` : baseScope;

type AzureTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error_description?: string;
};

type AuthToken = JWT & {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  id_token?: string;
  providerAccountId?: string;
  error?: 'RefreshTokenMissing' | 'RefreshAccessTokenError';
  message?: string;
};

async function refreshAccessToken(token: AuthToken) {
  try {
    if (!token.refresh_token) return { ...token, error: 'RefreshTokenMissing' as const };
    const params = new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID || '',
      client_secret: process.env.MS_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token as string,
      scope,
    });
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
    const data = (await res.json()) as AzureTokenResponse;
    if (!res.ok) {
      return { ...token, error: 'RefreshAccessTokenError' as const, message: data?.error_description };
    }
    return {
      ...token,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? token.refresh_token,
      expires_at: Date.now() + (data.expires_in ?? 3500) * 1000,
    };
  } catch (err) {
    console.error(err);
    return { ...token, error: 'RefreshAccessTokenError' as const };
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  providers: [
    AzureADProvider({
      clientId: process.env.MS_CLIENT_ID ?? '',
      clientSecret: process.env.MS_CLIENT_SECRET ?? '',
      tenantId,
      authorization: {
        params: {
          scope,
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        const expiresIn = typeof account.expires_in === 'number' ? account.expires_in : Number(account.expires_in ?? 0);
        token.access_token = account.access_token;
        token.refresh_token = account.refresh_token;
        token.expires_at = Date.now() + ((expiresIn || 3500) * 1000);
        token.id_token = account.id_token;
        token.providerAccountId = account.providerAccountId;
        token.email =
          (profile && typeof profile.email === 'string' && profile.email) ||
          (profile && typeof (profile as { preferred_username?: string }).preferred_username === 'string'
            ? (profile as { preferred_username?: string }).preferred_username
            : token.email);
        return token;
      }
      const expiresAt =
        typeof (token as AuthToken).expires_at === 'number'
          ? (token as AuthToken).expires_at
          : Number((token as AuthToken).expires_at ?? 0);
      if (expiresAt && Date.now() < expiresAt - 5 * 60 * 1000) {
        return token;
      }
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.access_token as string | undefined;
      session.refreshToken = token.refresh_token as string | undefined;
      session.expiresAt = token.expires_at as number | undefined;
      session.primaryAccountId = token.providerAccountId as string | undefined;
      if (token.email && session.user) {
        session.user.email = token.email as string;
      }
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};

let prismaAdapterEnabled: boolean | null = null;
let authOptionsWithAdapter: NextAuthOptions | null = null;

async function canUsePrismaAdapter() {
  if (prismaAdapterEnabled !== null) return prismaAdapterEnabled;
  if (process.env.NEXTAUTH_PRISMA_DISABLED === 'true') {
    prismaAdapterEnabled = false;
    return false;
  }
  if (!process.env.DATABASE_URL) {
    prismaAdapterEnabled = false;
    return false;
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    prismaAdapterEnabled = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[next-auth] Prisma adapter disabled: ${message}`);
    prismaAdapterEnabled = false;
  }
  return prismaAdapterEnabled;
}

async function getAuthOptions() {
  const useAdapter = await canUsePrismaAdapter();
  if (!useAdapter) return authOptions;
  if (!authOptionsWithAdapter) {
    authOptionsWithAdapter = { ...authOptions, adapter: PrismaAdapter(prisma) };
  }
  return authOptionsWithAdapter ?? authOptions;
}

const handler = async (req: Request) => {
  const options = await getAuthOptions();
  return NextAuth(options)(req);
};

export { handler as GET, handler as POST };
