"use client";

import { useActionState, useState } from "react";

import type { ActionState } from "./actions";

type ClientOption = { id: string; name: string };

type PolicyFormValues = {
  clientId?: string;
  insurer?: string;
  policyType?: string;
  policyNo?: string;
  startDate?: Date;
  endDate?: Date;
  premium?: string | null;
  status?: string;
};

type ClientMode = "existing" | "new";

function toDateInputValue(d?: Date | null) {
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function PolicyForm({
  clients,
  initialValues,
  action,
  submitLabel,
  allowPdfUpload,
  allowInlineClientCreate,
}: {
  clients: ClientOption[];
  initialValues?: PolicyFormValues;
  action: (
    state: ActionState,
    formData: FormData,
  ) => ActionState | Promise<ActionState>;
  submitLabel: string;
  allowPdfUpload?: boolean;
  allowInlineClientCreate?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );
  const [clientMode, setClientMode] = useState<ClientMode>(
    allowInlineClientCreate ? "new" : "existing",
  );

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm md:grid-cols-2">
        <input type="hidden" name="clientMode" value={clientMode} />

        <div className="space-y-2 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="text-sm font-semibold text-foreground">Cliente</label>
            {allowInlineClientCreate ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setClientMode("existing")}
                  className={
                    clientMode === "existing"
                      ? "rounded-lg bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-sm"
                      : "rounded-lg px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  }
                >
                  Selecionar
                </button>
                <button
                  type="button"
                  onClick={() => setClientMode("new")}
                  className={
                    clientMode === "new"
                      ? "rounded-lg bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-sm"
                      : "rounded-lg px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  }
                >
                  Novo cliente
                </button>
              </div>
            ) : null}
          </div>

          {clientMode === "existing" ? (
            <select
              name="clientId"
              required
              defaultValue={initialValues?.clientId ?? ""}
              className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
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
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-foreground">Nome</label>
                <input
                  name="clientName"
                  required
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">
                  CPF/CNPJ
                </label>
                <input
                  name="clientCpfCnpj"
                  required
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">
                  Telefone
                </label>
                <input
                  name="clientPhone"
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-foreground">E-mail</label>
                <input
                  name="clientEmail"
                  type="email"
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            Seguradora
          </label>
          <input
            name="insurer"
            required
            defaultValue={initialValues?.insurer ?? ""}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Tipo</label>
          <input
            name="policyType"
            required
            defaultValue={initialValues?.policyType ?? ""}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            Número da apólice
          </label>
          <input
            name="policyNo"
            required
            defaultValue={initialValues?.policyNo ?? ""}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Status</label>
          <select
            name="status"
            defaultValue={initialValues?.status ?? "ATIVA"}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          >
            <option value="ATIVA">ATIVA</option>
            <option value="VENCIDA">VENCIDA</option>
            <option value="CANCELADA">CANCELADA</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Início</label>
          <input
            name="startDate"
            type="date"
            required
            defaultValue={toDateInputValue(initialValues?.startDate)}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            Vencimento
          </label>
          <input
            name="endDate"
            type="date"
            required
            defaultValue={toDateInputValue(initialValues?.endDate)}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Prêmio</label>
          <input
            name="premium"
            inputMode="decimal"
            defaultValue={initialValues?.premium ?? ""}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        {allowPdfUpload ? (
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-foreground">
              PDF da apólice
            </label>
            <input
              name="pdf"
              type="file"
              accept="application/pdf"
              className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:brightness-95"
            />
            <div className="text-xs text-muted-foreground">
              Opcional. Você também pode anexar depois na tela da apólice.
            </div>
          </div>
        ) : null}
      </div>

      {state?.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-sm">
          {state.error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95 disabled:opacity-60"
      >
        {pending ? "Salvando..." : submitLabel}
      </button>
    </form>
  );
}
