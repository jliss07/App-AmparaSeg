"use client";

import { useActionState } from "react";

import type { ActionState } from "./actions";

type ClientOption = { id: string; name: string };
type PolicyOption = { id: string; policyNo: string };

export function ClaimForm({
  clients,
  policies,
  initialClientId,
  action,
}: {
  clients: ClientOption[];
  policies: PolicyOption[];
  initialClientId?: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const defaultDate = `${yyyy}-${mm}-${dd}`;

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Cliente</label>
          <select
            name="clientId"
            required
            defaultValue={initialClientId ?? ""}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          >
            <option value="" disabled>
              Selecione...
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="text-xs text-zinc-500">
            Selecione o cliente; para escolher apólice do cliente, abra esta tela
            pelo cliente.
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Apólice</label>
          <select
            name="policyId"
            defaultValue=""
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          >
            <option value="">Sem apólice</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.policyNo}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Data</label>
          <input
            name="occurredAt"
            type="date"
            required
            defaultValue={defaultDate}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Status</label>
          <select
            name="status"
            defaultValue="ABERTO"
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          >
            <option value="ABERTO">ABERTO</option>
            <option value="EM_ANDAMENTO">EM_ANDAMENTO</option>
            <option value="FINALIZADO">FINALIZADO</option>
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Descrição</label>
          <textarea
            name="description"
            required
            rows={4}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          />
        </div>
      </div>

      {state?.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Cadastrar sinistro"}
      </button>
    </form>
  );
}
