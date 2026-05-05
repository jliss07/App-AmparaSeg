import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function monthOptions() {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const label = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(
      new Date(2020, i, 1),
    );
    return { month, label };
  });
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mes?: string; clienteId?: string }>;
}) {
  const { q, mes, clienteId } = await searchParams;
  const query = q?.trim() ?? "";
  const month = mes ? Number(mes) : null;
  const clientId = clienteId?.trim() || null;

  let policies:
    | Array<{
        id: string;
        insurer: string;
        policyType: string;
        endDate: Date;
        status: string;
        pdfUrl: string | null;
        client: { id: string; name: string };
      }>
    | null = null;

  try {
    const ids = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p."id"
      FROM "Policy" p
      JOIN "Client" c ON c."id" = p."clientId"
      WHERE (
        ${clientId === null} = true
        OR p."clientId" = ${clientId ?? ""}
      )
      AND (
        ${month === null} = true
        OR EXTRACT(MONTH FROM p."endDate") = ${month ?? 0}
      )
      AND (
        ${query === ""} = true
        OR p."insurer" ILIKE ${"%" + query + "%"}
        OR c."name" ILIKE ${"%" + query + "%"}
        OR c."cpfCnpj" ILIKE ${"%" + query + "%"}
      )
      ORDER BY p."endDate" ASC
      LIMIT 200
    `;

    policies = await prisma.policy.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { endDate: "asc" },
    });
  } catch {
    policies = null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Apólices
          </h1>
          <p className="text-sm text-muted-foreground">
            Pesquisa por seguradora/cliente e filtro de vencimento por mês.
          </p>
        </div>
        <Link
          href="/app/apolices/novo"
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95"
        >
          Nova apólice
        </Link>
      </div>

      <form className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold text-foreground">
            Pesquisar (seguradora, cliente)
          </label>
          <input
            name="q"
            defaultValue={query}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            Vencimento (mês)
          </label>
          <select
            name="mes"
            defaultValue={month?.toString() ?? ""}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          >
            <option value="">Todos</option>
            {monthOptions().map((m) => (
              <option key={m.month} value={m.month}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <input type="hidden" name="clienteId" value={clientId ?? ""} />
        <div className="md:col-span-3">
          <button className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted">
            Aplicar filtros
          </button>
        </div>
      </form>

      {!policies ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
          Configure o banco de dados para listar apólices.
        </div>
      ) : policies.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-6 text-sm text-muted-foreground shadow-sm">
          Nenhuma apólice encontrada.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Apólice</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">PDF</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/apolices/${p.id}`}
                      className="font-semibold text-foreground hover:underline decoration-primary/60 underline-offset-4"
                    >
                      {p.insurer}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {p.policyType} • {p.status}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <Link
                      href={`/app/clientes/${p.client.id}`}
                      className="hover:underline decoration-primary/60 underline-offset-4"
                    >
                      {p.client.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(p.endDate)}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {p.pdfUrl ? (
                      <a
                        href={p.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-foreground hover:underline decoration-primary/60 underline-offset-4"
                      >
                        Ver PDF
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
