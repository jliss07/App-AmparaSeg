import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function monthLabel(month: number) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(
    new Date(2020, month - 1, 1),
  );
}

export default async function DashboardPage() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let stats: {
    clients: number;
    policiesExpiring30: number;
    birthdaysThisMonth: number;
  } | null = null;

  try {
    const [clients, policiesExpiring30, birthdayRows] = await Promise.all([
      prisma.client.count(),
      prisma.policy.count({ where: { endDate: { gte: now, lte: in30Days } } }),
      prisma.client.findMany({
        where: { birthDate: { not: null } },
        select: { birthDate: true },
      }),
    ]);

    const birthdaysThisMonth = birthdayRows.reduce((acc, r) => {
      if (!r.birthDate) return acc;
      return r.birthDate.getMonth() + 1 === month ? acc + 1 : acc;
    }, 0);
    stats = { clients, policiesExpiring30, birthdaysThisMonth };
  } catch {
    stats = null;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Painel
        </h1>
        <p className="text-sm text-muted-foreground">
          Visão geral e atalhos para filtros.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Clientes</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {stats?.clients ?? "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">
            Apólices vencendo (30 dias)
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {stats?.policiesExpiring30 ?? "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">
            Aniversários ({monthLabel(month)})
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {stats?.birthdaysThisMonth ?? "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">
                Vencimentos por mês
              </div>
              <div className="text-sm text-muted-foreground">
                Filtre apólices pelo mês de vencimento.
              </div>
            </div>
            <Link
              href={`/app/apolices?mes=${month}`}
              className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95"
            >
              Ver {monthLabel(month)}
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">
                Aniversários por mês
              </div>
              <div className="text-sm text-muted-foreground">
                Veja clientes aniversariantes no mês.
              </div>
            </div>
            <Link
              href={`/app/clientes?aniversarioMes=${month}`}
              className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95"
            >
              Ver {monthLabel(month)}
            </Link>
          </div>
        </div>
      </div>

      {!stats ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
          Configure o banco de dados (DATABASE_URL) e rode o schema para ver os
          números do painel.
        </div>
      ) : null}
    </div>
  );
}
