import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

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
  const monthValue = mes ? Number(mes) : null;
  const month =
    monthValue && Number.isFinite(monthValue) && monthValue >= 1 && monthValue <= 12
      ? monthValue
      : null;
  const clientIdRaw = clienteId?.trim() ?? "";
  const clientId = clientIdRaw && isUuid(clientIdRaw) ? clientIdRaw : null;

  let policies:
    | Array<{
        id: string;
        insurer: string;
        policyType: string;
        policyNo: string;
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
        (${clientId}::uuid IS NULL)
        OR p."clientId" = ${clientId}::uuid
      )
      AND (
        ${month === null} = true
        OR EXTRACT(MONTH FROM p."endDate") = ${month ?? 0}
      )
      AND (
        ${query === ""} = true
        OR p."policyNo" ILIKE ${"%" + query + "%"}
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
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Apólices
          </h1>
          <p className="text-sm text-zinc-600">
            Pesquisa por apólice e filtro de vencimento por mês.
          </p>
        </div>
        <Link
          href="/app/apolices/novo"
          className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Nova apólice
        </Link>
      </div>

      <form className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">
            Pesquisar (número, seguradora, cliente)
          </label>
          <input
            name="q"
            defaultValue={query}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">
            Vencimento (mês)
          </label>
          <select
            name="mes"
            defaultValue={month?.toString() ?? ""}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
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
          <button className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
            Aplicar filtros
          </button>
        </div>
      </form>

      {!policies ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Configure o banco de dados para listar apólices.
        </div>
      ) : policies.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-6 text-sm text-zinc-600">
          Nenhuma apólice encontrada.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-4 py-3">Apólice</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">PDF</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className="border-b border-zinc-200 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/apolices/${p.id}`}
                      className="font-semibold text-zinc-900 hover:underline"
                    >
                      {p.policyNo}
                    </Link>
                    <div className="text-xs text-zinc-500">
                      {p.insurer} • {p.policyType} • {p.status}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    <Link
                      href={`/app/clientes/${p.client.id}`}
                      className="hover:underline"
                    >
                      {p.client.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{formatDate(p.endDate)}</td>
                  <td className="px-4 py-3 text-zinc-700">
                    {p.pdfUrl ? (
                      <a
                        href={p.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-900 hover:underline"
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
