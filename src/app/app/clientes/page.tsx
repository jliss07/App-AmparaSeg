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

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; aniversarioMes?: string }>;
}) {
  const { q, aniversarioMes } = await searchParams;
  const query = q?.trim() ?? "";
  const month = aniversarioMes ? Number(aniversarioMes) : null;

  let clients:
    | Array<{
        id: string;
        name: string;
        cpfCnpj: string;
        email: string | null;
        phone: string | null;
        birthDate: Date | null;
        _count: { vehicles: number; policies: number; claims: number };
      }>
    | null = null;

  try {
    if (month && month >= 1 && month <= 12) {
      clients = await prisma.client.findMany({
        where: {
          birthDate: { not: null },
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { cpfCnpj: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          cpfCnpj: true,
          email: true,
          phone: true,
          birthDate: true,
          _count: { select: { vehicles: true, policies: true, claims: true } },
        },
        orderBy: { name: "asc" },
      });
      clients = clients
        .filter((c) => (c.birthDate ? c.birthDate.getMonth() + 1 === month : false))
        .slice(0, 200);
    } else {
      clients = await prisma.client.findMany({
        where: query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { cpfCnpj: { contains: query, mode: "insensitive" } },
              ],
            }
          : undefined,
        select: {
          id: true,
          name: true,
          cpfCnpj: true,
          email: true,
          phone: true,
          birthDate: true,
          _count: { select: { vehicles: true, policies: true, claims: true } },
        },
        orderBy: { name: "asc" },
        take: 200,
      });
    }
  } catch {
    clients = null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Clientes
          </h1>
          <p className="text-sm text-zinc-600">
            Cadastro, pesquisa e aniversários por mês.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Link
            href="/app/clientes/importar"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Importar Excel
          </Link>
          <Link
            href="/app/clientes/novo"
            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Novo cliente
          </Link>
        </div>
      </div>

      <form className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">
            Pesquisar (nome ou CPF/CNPJ)
          </label>
          <input
            name="q"
            defaultValue={query}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">
            Aniversário (mês)
          </label>
          <select
            name="aniversarioMes"
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
        <div className="md:col-span-3">
          <button className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
            Aplicar filtros
          </button>
        </div>
      </form>

      {!clients ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Configure o banco de dados para listar clientes.
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-6 text-sm text-zinc-600">
          Nenhum cliente encontrado.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">CPF/CNPJ</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Itens</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-zinc-200 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/clientes/${c.id}`}
                      className="font-semibold text-zinc-900 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{c.cpfCnpj}</td>
                  <td className="px-4 py-3 text-zinc-700">
                    <span
                      className={[
                        "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                        c._count.policies > 0
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {c._count.policies > 0 ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    <div>{c.phone ?? "—"}</div>
                    <div className="text-xs text-zinc-500">{c.email ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    <div className="text-xs">
                      Veículos: {c._count.vehicles} • Apólices: {c._count.policies}{" "}
                      • Sinistros: {c._count.claims}
                    </div>
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
