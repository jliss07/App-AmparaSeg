"use client";

import Link from "next/link";
import { useActionState } from "react";

import { importClientsAction, type ImportClientsState } from "../actions";

export default function ImportClientsPage() {
  const [state, formAction, pending] = useActionState<
    ImportClientsState,
    FormData
  >(importClientsAction, null);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Importar clientes e apólices
          </h1>
          <p className="text-sm text-muted-foreground">
            Envie um Excel (.xlsx ou .xls) e o sistema cadastra/atualiza clientes e
            apólices.
          </p>
        </div>
        <Link
          href="/app/clientes"
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted"
        >
          Voltar
        </Link>
      </div>

      <form
        action={formAction}
        encType="multipart/form-data"
        className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground">Arquivo</div>
            <input
              name="file"
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:brightness-95"
              required
            />
            <div className="text-xs text-muted-foreground">
              A primeira linha deve ser o cabeçalho.
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground">
              Colunas reconhecidas
            </div>
            <div className="text-xs text-muted-foreground">
              Clientes: Nome, CPF/CNPJ, E-mail, Telefone, Data de nascimento,
              Observações.
            </div>
            <div className="text-xs text-muted-foreground">
              Apólices: Seguradora, Tipo, Início, Vencimento, Prêmio, Status
              (opcional).
            </div>
            <div className="text-xs text-muted-foreground">
              Obrigatórias: Nome e CPF/CNPJ. Para importar apólices também, marque
              a opção abaixo e inclua as colunas de apólice.
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <input
            id="includePolicies"
            name="includePolicies"
            type="checkbox"
            value="1"
            defaultChecked
            className="h-4 w-4 accent-teal-600"
          />
          <label
            htmlFor="includePolicies"
            className="text-sm font-semibold text-foreground"
          >
            Importar apólices junto com clientes
          </label>
        </div>

        {state?.error ? (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
            {state.error}
          </div>
        ) : null}

        {state?.total != null ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold text-muted-foreground">
                Linhas
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {state.total}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <div className="text-xs font-semibold text-muted-foreground">
                  Clientes criados
                </div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {state.created ?? 0}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <div className="text-xs font-semibold text-muted-foreground">
                  Clientes atualizados
                </div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {state.updated ?? 0}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <div className="text-xs font-semibold text-muted-foreground">
                  Clientes ignorados
                </div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {state.skipped ?? 0}
                </div>
              </div>
            </div>

            {state.policiesTotal != null ? (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Apólices (linhas)
                  </div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {state.policiesTotal}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Apólices criadas
                  </div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {state.policiesCreated ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Apólices atualizadas
                  </div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {state.policiesUpdated ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Apólices ignoradas
                  </div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {state.policiesSkipped ?? 0}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {state?.rowErrors?.length ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground">
              Linhas com erro (primeiras {state.rowErrors.length})
            </div>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-card text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Linha</th>
                  <th className="px-4 py-3">Problema</th>
                </tr>
              </thead>
              <tbody>
                {state.rowErrors.map((e) => (
                  <tr
                    key={`${e.row}-${e.message}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 text-slate-700">{e.row}</td>
                    <td className="px-4 py-3 text-slate-700">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95 disabled:opacity-60"
          >
            {pending ? "Importando..." : "Importar"}
          </button>
        </div>
      </form>
    </div>
  );
}
