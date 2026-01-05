import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  loadEnvConfig(process.cwd());
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
