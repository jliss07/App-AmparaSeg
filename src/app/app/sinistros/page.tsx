import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { deleteClaimAction } from "./actions";

export const dynamic = "force-dynamic";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; clienteId?: string }>;
}) {
  const { q, status, clienteId } = await searchParams;
  const query = q?.trim() ?? "";
  const st = status?.trim() ?? "";
  const clientIdRaw = clienteId?.trim() ?? "";
  const clientId = clientIdRaw && isUuid(clientIdRaw) ? clientIdRaw : null;

  let claims:
    | Array<{
        id: string;
        occurredAt: Date;
        status: string;
        description: string;
        client: { id: string; name: string };
        policy: { id: string; policyNo: string } | null;
      }>
    | null = null;

  try {
    const ids = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT s."id"
      FROM "Claim" s
      JOIN "Client" c ON c."id" = s."clientId"
      LEFT JOIN "Policy" p ON p."id" = s."policyId"
      WHERE (
        (${clientId}::uuid IS NULL)
        OR s."clientId" = ${clientId}::uuid
      )
      AND (
        ${st === ""} = true
        OR s."status" = ${st}
      )
      AND (
        ${query === ""} = true
        OR c."name" ILIKE ${"%" + query + "%"}
        OR c."cpfCnpj" ILIKE ${"%" + query + "%"}
        OR COALESCE(p."policyNo", '') ILIKE ${"%" + query + "%"}
      )
      ORDER BY s."occurredAt" DESC
      LIMIT 200
    `;

    claims = await prisma.claim.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: {
        client: { select: { id: true, name: true } },
        policy: { select: { id: true, policyNo: true } },
      },
      orderBy: { occurredAt: "desc" },
    });
  } catch {
    claims = null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Sinistros
          </h1>
          <p className="text-sm text-zinc-600">Registro e pesquisa.</p>
        </div>
        <Link
          href="/app/sinistros/novo"
          className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Novo sinistro
        </Link>
      </div>

      <form className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">
            Pesquisar (cliente, CPF/CNPJ, apólice)
          </label>
          <input
            name="q"
            defaultValue={query}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Status</label>
          <select
            name="status"
            defaultValue={st}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          >
            <option value="">Todos</option>
            <option value="ABERTO">ABERTO</option>
            <option value="EM_ANDAMENTO">EM_ANDAMENTO</option>
            <option value="FINALIZADO">FINALIZADO</option>
          </select>
        </div>
        <input type="hidden" name="clienteId" value={clientId ?? ""} />
        <div className="md:col-span-3">
          <button className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
            Aplicar filtros
          </button>
        </div>
      </form>

      {!claims ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Configure o banco de dados para listar sinistros.
        </div>
      ) : claims.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-6 text-sm text-zinc-600">
          Nenhum sinistro encontrado.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Apólice</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {claims.map((s) => {
                const del = deleteClaimAction.bind(null, s.id);
                return (
                  <tr
                    key={s.id}
                    className="border-b border-zinc-200 last:border-0"
                  >
                    <td className="px-4 py-3 text-zinc-700">
                      {formatDate(s.occurredAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/app/clientes/${s.client.id}`}
                        className="font-semibold text-zinc-900 hover:underline"
                      >
                        {s.client.name}
                      </Link>
                      <div className="text-xs text-zinc-500">{s.description}</div>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {s.policy ? (
                        <Link
                          href={`/app/apolices/${s.policy.id}`}
                          className="hover:underline"
                        >
                          {s.policy.policyNo}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{s.status}</td>
                    <td className="px-4 py-3 text-right">
                      <form action={del}>
                        <button className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50">
                          Excluir
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
