import Link from "next/link";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  addVehicleAction,
  deleteClientAction,
  deleteVehicleAction,
} from "../actions";

export const dynamic = "force-dynamic";

type ClientWithRelations = Prisma.ClientGetPayload<{
  include: {
    vehicles: true;
    policies: true;
  };
}>;

function formatDate(d?: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

export default async function ClientDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erroVeiculo?: string }>;
}) {
  const { id } = await params;
  const { erroVeiculo } = await searchParams;

  let client: ClientWithRelations | null = null;
  try {
    client = await prisma.client.findUnique({
      where: { id },
      include: {
        vehicles: { orderBy: { createdAt: "desc" } },
        policies: { orderBy: { endDate: "desc" } },
      },
    });
  } catch {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        Configure o banco de dados para acessar o cliente.
      </div>
    );
  }

  if (!client) {
    return (
      <div className="rounded-2xl border border-border bg-card px-5 py-6 text-sm text-muted-foreground shadow-sm">
        Cliente não encontrado.
      </div>
    );
  }

  const addVehicle = addVehicleAction.bind(null, client.id);
  const deleteClient = deleteClientAction.bind(null, client.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/clientes"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted mb-4"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Voltar para Clientes
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {client.name}
          </h1>
          <div className="text-sm text-muted-foreground">
            CPF/CNPJ: {client.cpfCnpj} • Nascimento: {formatDate(client.birthDate)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/clientes/${client.id}/editar`}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted"
          >
            Editar
          </Link>
          <form action={deleteClient}>
            <button className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-100">
              Excluir
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-2">
          <div className="text-sm font-semibold text-foreground">Contato</div>
          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Telefone</div>
              <div>{client.phone ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">E-mail</div>
              <div>{client.email ?? "—"}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs text-muted-foreground">Observações</div>
            <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
              {client.notes ?? "—"}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="text-sm font-semibold text-foreground">Atalhos</div>
          <div className="mt-4 space-y-2">
            <Link
              href={`/app/apolices/novo?clienteId=${client.id}`}
              className="block rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95"
            >
              Nova apólice
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div className="space-y-1">
              <div className="text-lg font-semibold tracking-tight text-foreground">
                Veículos
              </div>
              <div className="text-sm text-muted-foreground">
                Vinculados ao cliente.
              </div>
            </div>
          </div>

          <form
            action={addVehicle}
            className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-2"
          >
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-foreground">Placa</label>
              <input
                name="plate"
                required
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Marca</label>
              <input
                name="brand"
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Modelo</label>
              <input
                name="model"
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Ano</label>
              <input
                name="year"
                inputMode="numeric"
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Renavam
              </label>
              <input
                name="renavam"
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>
            <div className="md:col-span-2">
              <button className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95">
                Vincular veículo
              </button>
            </div>
            {erroVeiculo ? (
              <div className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
                Verifique os dados do veículo.
              </div>
            ) : null}
          </form>

          {client.vehicles.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-5 py-6 text-sm text-muted-foreground shadow-sm">
              Nenhum veículo vinculado.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Placa</th>
                    <th className="px-4 py-3">Veículo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {client.vehicles.map((v) => {
                    const deleteVehicle = deleteVehicleAction.bind(
                      null,
                      v.id,
                      client.id,
                    );
                    return (
                      <tr
                        key={v.id}
                        className="border-b border-border last:border-0 hover:bg-muted/50"
                      >
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {v.plate}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {[v.brand, v.model, v.year].filter(Boolean).join(" • ") ||
                            "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <form action={deleteVehicle}>
                            <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-sm hover:bg-muted">
                              Remover
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

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div className="space-y-1">
                <div className="text-lg font-semibold tracking-tight text-foreground">
                  Apólices
                </div>
                <div className="text-sm text-muted-foreground">
                  Vínculos e vencimentos.
                </div>
              </div>
              <Link
                href={`/app/apolices?clienteId=${client.id}`}
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted"
              >
                Ver todas
              </Link>
            </div>
            {client.policies.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card px-5 py-6 text-sm text-muted-foreground shadow-sm">
                Nenhuma apólice cadastrada.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Seguradora</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Vencimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.policies.slice(0, 5).map((p) => (
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
                        </td>
                        <td className="px-4 py-3 text-slate-700">{p.policyType}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatDate(p.endDate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
