"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { z } from "zod";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function syncClientStatus(clientId: string) {
  try {
    const policies = await prisma.policy.count({ where: { clientId } });
    await prisma.client.update({
      where: { id: clientId },
      data: { status: policies > 0 ? "ATIVO" : "INATIVO" },
    });
  } catch {
    return;
  }
}

const updatePolicySchema = z.object({
  clientId: z.string().uuid().or(z.literal("")),
  insurer: z.string().optional().or(z.literal("")),
  policyType: z.string().optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
  premium: z.string().optional().or(z.literal("")),
  status: z.string().optional().or(z.literal("")),
});

function toOptionalDate(value: string) {
  const s = value.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export type ActionState = { error?: string } | null;

export type ParsePolicyPdfState =
  | {
      error?: string;
      data?: {
        clientName?: string;
        clientCpfCnpj?: string;
        clientEmail?: string;
        clientPhone?: string;
        insurer?: string;
        policyType?: string;
        policyNo?: string;
        startDate?: string;
        endDate?: string;
        premium?: string;
        status?: string;
      };
    }
  | null;

const createPolicySchema = z.union([
  updatePolicySchema.extend({
    clientMode: z.literal("existing"),
  }),
  updatePolicySchema.omit({ clientId: true }).extend({
    clientMode: z.literal("new"),
    clientName: z.string().optional().or(z.literal("")),
    clientCpfCnpj: z.string().optional().or(z.literal("")),
    clientEmail: z.string().email().optional().or(z.literal("")),
    clientPhone: z.string().optional().or(z.literal("")),
    clientBirthDate: z.string().optional().or(z.literal("")),
    clientNotes: z.string().optional().or(z.literal("")),
  }),
]);

function generateCpfCnpj() {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `SEMCPF-${uuid}`;
}

function generatePolicyNo() {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `AUTO-${uuid}`;
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function toDateInputFromBr(value: string | null) {
  if (!value) return null;
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const yyyy = m[3];
  const mm = m[2];
  const dd = m[1];
  return `${yyyy}-${mm}-${dd}`;
}

function pick(text: string, re: RegExp) {
  const m = text.match(re);
  const v = m?.[1] ? normalizeSpaces(m[1]) : "";
  return v ? v : null;
}

export async function parsePolicyPdfAction(
  _: ParsePolicyPdfState,
  formData: FormData,
): Promise<ParsePolicyPdfState> {
  await requireSession();
  const file = formData.get("pdf");
  if (!file || !(file instanceof File) || file.size === 0) {
    return { error: "Selecione um PDF." };
  }
  if (file.type !== "application/pdf") {
    return { error: "Envie um arquivo PDF válido." };
  }

  try {
    const { PDFParse } = await import("pdf-parse");
    const buffer = new Uint8Array(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const res = await parser.getText();
    const text = normalizeSpaces(res.text ?? "");
    if (!text) return { error: "Não foi possível ler o conteúdo do PDF." };

    const clientCpfCnpj = pick(text, /\bcpf\/?cnpj\b\s*[:\-]?\s*([0-9.\-\/]{5,})/i);
    const clientName =
      pick(
        text,
        /\bsegurado\b\s*[:\-]?\s*([A-ZÀ-ÿ0-9().\s]{3,})(?=\bcpf\/?cnpj\b|\binscricao\b|\bendereco\b|$)/i,
      ) ??
      pick(
        text,
        /\bproponente\b\s*[:\-]?\s*([A-ZÀ-ÿ0-9().\s]{3,})(?=\bcpf\/?cnpj\b|\binscricao\b|\bendereco\b|$)/i,
      );

    const insurer =
      pick(text, /\bseguradora\b\s*[:\-]?\s*([A-ZÀ-ÿ0-9\/\-. ]{2,})(?=\bap[oó]lice\b|\bn[ºo]\b|\bvig[eê]ncia\b|\bin[ií]cio\b|$)/i) ??
      pick(text, /\bcia\b\.?\s*[:\-]?\s*([A-ZÀ-ÿ0-9\/\-. ]{2,})(?=\bap[oó]lice\b|\bn[ºo]\b|\bvig[eê]ncia\b|\bin[ií]cio\b|$)/i);

    const policyNo =
      pick(text, /\bap[oó]lice\b\s*(?:n[ºo]|n|num(?:ero)?)?\s*[:\-]?\s*([A-Z0-9.\-\/]{4,})/i) ??
      pick(text, /\bn[ºo]\s*da\s*ap[oó]lice\b\s*[:\-]?\s*([A-Z0-9.\-\/]{4,})/i);

    const policyType =
      pick(text, /\bramo\b\s*[:\-]?\s*([A-ZÀ-ÿ0-9\/\-. ]{2,})(?=\bap[oó]lice\b|\bvig[eê]ncia\b|$)/i) ??
      pick(text, /\btipo\b\s*[:\-]?\s*([A-ZÀ-ÿ0-9\/\-. ]{2,})(?=\bap[oó]lice\b|\bvig[eê]ncia\b|$)/i);

    const startBr =
      pick(text, /\bin[ií]cio\b\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) ??
      pick(text, /\bvig[eê]ncia\b\s*(?:de)?\s*(\d{2}\/\d{2}\/\d{4})/i);
    const endBr =
      pick(text, /\b(?:fim|vencimento)\b\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) ??
      pick(text, /\bvig[eê]ncia\b.*?\b(?:a|at[eé])\b\s*(\d{2}\/\d{2}\/\d{4})/i);

    const startDate = toDateInputFromBr(startBr);
    const endDate = toDateInputFromBr(endBr);

    const premium =
      pick(text, /\bpr[eê]mio\b(?:\s+total)?\s*[:\-]?\s*(?:r\$)?\s*([0-9.\-]+,[0-9]{2})/i) ??
      pick(text, /\bvalor\b\s*(?:do\s*)?pr[eê]mio\b\s*[:\-]?\s*(?:r\$)?\s*([0-9.\-]+,[0-9]{2})/i);

    const clientEmail = pick(text, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
    const clientPhone = pick(
      text,
      /\b(\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4})\b/i,
    );

    return {
      data: {
        clientName: clientName ?? undefined,
        clientCpfCnpj: clientCpfCnpj ?? undefined,
        clientEmail: clientEmail ?? undefined,
        clientPhone: clientPhone ?? undefined,
        insurer: insurer ?? undefined,
        policyType: policyType ?? undefined,
        policyNo: policyNo ?? undefined,
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
        premium: premium ? premium.replace(/\./g, "").replace(",", ".") : undefined,
      },
    };
  } catch {
    return { error: "Não foi possível ler o PDF." };
  }
}

export async function createPolicyAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const file = formData.get("pdf");
  const hasFile = file instanceof File && file.size > 0;

  if (hasFile && file.type !== "application/pdf") {
    return { error: "Envie um arquivo PDF válido." };
  }

  const parsed = createPolicySchema.safeParse({
    clientMode: formData.get("clientMode") ?? "existing",
    clientId: formData.get("clientId") ?? "",
    clientName: formData.get("clientName") ?? "",
    clientCpfCnpj: formData.get("clientCpfCnpj") ?? "",
    clientEmail: formData.get("clientEmail") ?? "",
    clientPhone: formData.get("clientPhone") ?? "",
    clientBirthDate: formData.get("clientBirthDate") ?? "",
    clientNotes: formData.get("clientNotes") ?? "",
    insurer: formData.get("insurer") ?? "",
    policyType: formData.get("policyType") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    premium: formData.get("premium") ?? "",
    status: formData.get("status") ?? "ATIVA",
  });

  if (!parsed.success) return { error: "Dados inválidos. Verifique os campos." };

  try {
    const inlineClientCpfCnpj =
      parsed.data.clientMode === "new" && parsed.data.clientCpfCnpj?.trim()
        ? parsed.data.clientCpfCnpj.trim()
        : parsed.data.clientMode === "new"
          ? generateCpfCnpj()
          : null;
    const inlineClientName =
      parsed.data.clientMode === "new" && parsed.data.clientName?.trim()
        ? parsed.data.clientName.trim()
        : parsed.data.clientMode === "new"
          ? "Sem nome"
          : null;

    const clientId =
      parsed.data.clientMode === "existing" && parsed.data.clientId
        ? parsed.data.clientId
        : parsed.data.clientMode === "new"
          ? (
              await prisma.client.upsert({
                where: {
                  cpfCnpj: inlineClientCpfCnpj ?? generateCpfCnpj(),
                },
                select: { id: true },
                create: {
                  name: inlineClientName ?? "Sem nome",
                  cpfCnpj: inlineClientCpfCnpj ?? generateCpfCnpj(),
                  email: parsed.data.clientEmail?.trim()
                    ? parsed.data.clientEmail.trim()
                    : null,
                  phone: parsed.data.clientPhone?.trim()
                    ? parsed.data.clientPhone.trim()
                    : null,
                  birthDate: toOptionalDate(parsed.data.clientBirthDate ?? "") ?? null,
                  notes: parsed.data.clientNotes?.trim()
                    ? parsed.data.clientNotes.trim()
                    : null,
                },
                update: {
                  name: inlineClientName ?? "Sem nome",
                  email: parsed.data.clientEmail?.trim()
                    ? parsed.data.clientEmail.trim()
                    : null,
                  phone: parsed.data.clientPhone?.trim()
                    ? parsed.data.clientPhone.trim()
                    : null,
                  birthDate: toOptionalDate(parsed.data.clientBirthDate ?? "") ?? null,
                  notes: parsed.data.clientNotes?.trim()
                    ? parsed.data.clientNotes.trim()
                    : null,
                },
              })
            ).id
          : (
              await prisma.client.create({
                select: { id: true },
                data: { name: "Sem nome", cpfCnpj: generateCpfCnpj() },
              })
            ).id;

    const startDate = toOptionalDate(parsed.data.startDate ?? "") ?? new Date();
    const endDate =
      toOptionalDate(parsed.data.endDate ?? "") ??
      (() => {
        const d = new Date(startDate);
        d.setFullYear(d.getFullYear() + 1);
        return d;
      })();

    const created = await prisma.policy.create({
      data: {
        clientId,
        insurer: parsed.data.insurer?.trim() ? parsed.data.insurer.trim() : "SEM SEGURADORA",
        policyType: parsed.data.policyType?.trim() ? parsed.data.policyType.trim() : "SEM TIPO",
        policyNo: generatePolicyNo(),
        startDate,
        endDate,
        premium: parsed.data.premium?.trim() ? parsed.data.premium.trim() : null,
        status: parsed.data.status?.trim() ? parsed.data.status.trim() : "ATIVA",
      },
    });

    await syncClientStatus(clientId);

    if (hasFile) {
      try {
        const blob = await put(`apolices/${created.id}/${file.name}`, file, {
          access: "public",
        });
        await prisma.policy.update({
          where: { id: created.id },
          data: { pdfUrl: blob.url, pdfFileName: file.name },
        });
        revalidatePath("/app/apolices");
        redirect(`/app/apolices/${created.id}`);
      } catch {
        revalidatePath("/app/apolices");
        redirect(`/app/apolices/${created.id}?erroPdf=3`);
      }
    }

    revalidatePath("/app/apolices");
    revalidatePath("/app/clientes");
    redirect(`/app/apolices/${created.id}`);
    return null;
  } catch {
    return {
      error: "Não foi possível salvar. Verifique se a apólice já existe.",
    };
  }
}

export async function updatePolicyAction(
  policyId: string,
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const parsed = updatePolicySchema.safeParse({
    clientId: formData.get("clientId") ?? "",
    insurer: formData.get("insurer") ?? "",
    policyType: formData.get("policyType") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    premium: formData.get("premium") ?? "",
    status: formData.get("status") ?? "ATIVA",
  });

  if (!parsed.success) return { error: "Dados inválidos. Verifique os campos." };

  try {
    const existing = await prisma.policy.findUnique({
      where: { id: policyId },
      select: {
        clientId: true,
        insurer: true,
        policyType: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });
    if (!existing) return { error: "Apólice não encontrada." };

    const clientId = parsed.data.clientId ? parsed.data.clientId : existing.clientId;
    const insurer = parsed.data.insurer?.trim() ? parsed.data.insurer.trim() : existing.insurer;
    const policyType = parsed.data.policyType?.trim()
      ? parsed.data.policyType.trim()
      : existing.policyType;
    const startDate = toOptionalDate(parsed.data.startDate ?? "") ?? existing.startDate;
    const endDate = toOptionalDate(parsed.data.endDate ?? "") ?? existing.endDate;
    const status = parsed.data.status?.trim() ? parsed.data.status.trim() : existing.status;

    await prisma.policy.update({
      where: { id: policyId },
      data: {
        clientId,
        insurer,
        policyType,
        startDate,
        endDate,
        premium: parsed.data.premium?.trim() ? parsed.data.premium.trim() : null,
        status,
      },
    });

    if (existing.clientId !== clientId) {
      await syncClientStatus(existing.clientId);
      await syncClientStatus(clientId);
    } else {
      await syncClientStatus(clientId);
    }

    revalidatePath("/app/apolices");
    revalidatePath(`/app/apolices/${policyId}`);
    redirect(`/app/apolices/${policyId}`);
    return null;
  } catch {
    return {
      error: "Não foi possível salvar. Verifique se a apólice já existe.",
    };
  }
}

export async function deletePolicyAction(policyId: string) {
  await requireSession();
  const existing = await prisma.policy.findUnique({
    where: { id: policyId },
    select: { clientId: true },
  });
  await prisma.policy.delete({ where: { id: policyId } });
  if (existing) await syncClientStatus(existing.clientId);
  revalidatePath("/app/apolices");
  revalidatePath("/app/clientes");
  redirect("/app/apolices");
}

export async function uploadPolicyPdfAction(policyId: string, formData: FormData) {
  await requireSession();

  const file = formData.get("pdf");
  if (!file || !(file instanceof File) || file.size === 0) {
    redirect(`/app/apolices/${policyId}?erroPdf=1`);
  }
  if (file.type !== "application/pdf") {
    redirect(`/app/apolices/${policyId}?erroPdf=2`);
  }

  const blob = await put(`apolices/${policyId}/${file.name}`, file, {
    access: "public",
  });

  await prisma.policy.update({
    where: { id: policyId },
    data: { pdfUrl: blob.url, pdfFileName: file.name },
  });

  revalidatePath(`/app/apolices/${policyId}`);
  redirect(`/app/apolices/${policyId}`);
}

export async function removePolicyPdfAction(policyId: string) {
  await requireSession();
  await prisma.policy.update({
    where: { id: policyId },
    data: { pdfUrl: null, pdfFileName: null },
  });
  revalidatePath(`/app/apolices/${policyId}`);
  redirect(`/app/apolices/${policyId}`);
}
