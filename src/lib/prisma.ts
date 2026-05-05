import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function pickDatabaseUrl() {
  const raw =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL_NO_SSL ??
    "";

  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeDatabaseUrl(url: string) {
  try {
    const u = new URL(url);
    const isPooler = u.hostname.includes("-pooler.");
    if (isPooler) {
      if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
      if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
      if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
      if (!u.searchParams.has("statement_cache_size")) {
        u.searchParams.set("statement_cache_size", "0");
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

function createClient() {
  const databaseUrl = normalizeDatabaseUrl(pickDatabaseUrl());
  if (!databaseUrl) {
    return new Proxy(
      {},
      {
        get() {
          throw new Error("DATABASE_URL não configurado.");
        },
      },
    ) as PrismaClient;
  }

  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
