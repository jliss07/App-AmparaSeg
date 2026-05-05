"use client";

import { useActionState, useRef, useState } from "react";

import { parsePolicyPdfAction, type ActionState } from "./actions";

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
  const [clientId, setClientId] = useState(initialValues?.clientId ?? "");
  const [clientName, setClientName] = useState("");
  const [clientCpfCnpj, setClientCpfCnpj] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [insurer, setInsurer] = useState(initialValues?.insurer ?? "");
  const [policyType, setPolicyType] = useState(initialValues?.policyType ?? "");
  const [policyNo, setPolicyNo] = useState(initialValues?.policyNo ?? "");
  const [status, setStatus] = useState(initialValues?.status ?? "ATIVA");
  const [startDate, setStartDate] = useState(toDateInputValue(initialValues?.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(initialValues?.endDate));
  const [premium, setPremium] = useState(initialValues?.premium ?? "");
  const [pdfParsePending, setPdfParsePending] = useState(false);
  const [pdfParseError, setPdfParseError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

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
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
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
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">
                  CPF/CNPJ
                </label>
                <input
                  name="clientCpfCnpj"
                  value={clientCpfCnpj}
                  onChange={(e) => setClientCpfCnpj(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">
                  Telefone
                </label>
                <input
                  name="clientPhone"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-foreground">E-mail</label>
                <input
                  name="clientEmail"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
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
            value={insurer}
            onChange={(e) => setInsurer(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Tipo</label>
          <input
            name="policyType"
            value={policyType}
            onChange={(e) => setPolicyType(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            Número da apólice
          </label>
          <input
            name="policyNo"
            value={policyNo}
            onChange={(e) => setPolicyNo(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Status</label>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
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
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Prêmio</label>
          <input
            name="premium"
            inputMode="decimal"
            value={premium}
            onChange={(e) => setPremium(e.target.value)}
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
              ref={pdfInputRef}
              className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:brightness-95"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={pdfParsePending}
                onClick={async () => {
                  const file = pdfInputRef.current?.files?.[0];
                  if (!file) {
                    setPdfParseError("Selecione um PDF para preencher automaticamente.");
                    return;
                  }
                  setPdfParseError(null);
                  setPdfParsePending(true);
                  try {
                    const fd = new FormData();
                    fd.set("pdf", file);
                    const res = await parsePolicyPdfAction(null, fd);
                    if (res?.error) {
                      setPdfParseError(res.error);
                      return;
                    }
                    const d = res?.data ?? {};
                    if (d.clientName || d.clientCpfCnpj) {
                      setClientMode(allowInlineClientCreate ? "new" : "existing");
                    }
                    if (d.clientName) setClientName(d.clientName);
                    if (d.clientCpfCnpj) setClientCpfCnpj(d.clientCpfCnpj);
                    if (d.clientEmail) setClientEmail(d.clientEmail);
                    if (d.clientPhone) setClientPhone(d.clientPhone);
                    if (d.insurer) setInsurer(d.insurer);
                    if (d.policyType) setPolicyType(d.policyType);
                    if (d.policyNo) setPolicyNo(d.policyNo);
                    if (d.status) setStatus(d.status);
                    if (d.startDate) setStartDate(d.startDate);
                    if (d.endDate) setEndDate(d.endDate);
                    if (d.premium) setPremium(d.premium);
                  } finally {
                    setPdfParsePending(false);
                  }
                }}
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted disabled:opacity-60"
              >
                {pdfParsePending ? "Lendo PDF..." : "Preencher pelo PDF"}
              </button>
              <div className="text-xs text-muted-foreground">
                Lê o texto do PDF e tenta preencher os campos automaticamente.
              </div>
            </div>
            {pdfParseError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
                {pdfParseError}
              </div>
            ) : null}
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
