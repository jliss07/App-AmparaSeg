"use client";

import { useActionState } from "react";

import type { ActionState } from "./actions";

type ClientFormValues = {
  name?: string;
  cpfCnpj?: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: Date | null;
  notes?: string | null;
};

function toDateInputValue(d?: Date | null) {
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ClientForm({
  initialValues,
  action,
  submitLabel,
}: {
  initialValues?: ClientFormValues;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Nome</label>
          <input
            name="name"
            defaultValue={initialValues?.name ?? ""}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">CPF/CNPJ</label>
          <input
            name="cpfCnpj"
            defaultValue={initialValues?.cpfCnpj ?? ""}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">Telefone</label>
          <input
            name="phone"
            defaultValue={initialValues?.phone ?? ""}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">E-mail</label>
          <input
            name="email"
            type="email"
            defaultValue={initialValues?.email ?? ""}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-900">
            Data de nascimento
          </label>
          <input
            name="birthDate"
            type="date"
            defaultValue={toDateInputValue(initialValues?.birthDate)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-zinc-900">Observações</label>
          <textarea
            name="notes"
            defaultValue={initialValues?.notes ?? ""}
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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Salvando..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
