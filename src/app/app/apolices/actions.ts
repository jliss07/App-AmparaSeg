"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { PDFParse } from "pdf-parse";
import { z } from "zod";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updatePolicySchema = z.object({
  clientId: z.string().uuid(),
  insurer: z.string().min(2),
  policyType: z.string().min(2),
  policyNo: z.string().min(2),
  startDate: z.string().min(4),
  endDate: z.string().min(4),
  premium: z.string().optional().or(z.literal("")),
  status: z.string().min(2),
});

function toDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("invalid date");
  return d;
}

function toOptionalDate(value: string) {
  const s = value.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export type ActionState = { error?: string } | null;

const createPolicySchema = z.union([
  updatePolicySchema.extend({
    clientMode: z.literal("existing"),
  }),
  updatePolicySchema.omit({ clientId: true }).extend({
    clientMode: z.literal("new"),
    clientName: z.string().min(2),
    clientCpfCnpj: z.string().min(5),
    clientEmail: z.string().email().optional().or(z.literal("")),
    clientPhone: z.string().optional().or(z.literal("")),
    clientBirthDate: z.string().optional().or(z.literal("")),
    clientNotes: z.string().optional().or(z.literal("")),
  }),
]);

type ParsedPolicyPdfData = {
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

export type ParsePolicyPdfState =
  | { error?: string; data?: ParsedPolicyPdfData }
  | null;

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function extractFirstByLine(
  lines: string[],
  patterns: Array<RegExp>,
): string | null {
  for (const line of lines) {
    for (const p of patterns) {
      const m = line.match(p);
      if (m && m[1]) return normalizeSpaces(m[1]);
    }
  }
  return null;
}

function extractFirstMatch(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  if (!m) return null;
  const g = m[1] ?? m[0];
  return normalizeSpaces(String(g));
}

function parsePtBrDate(s: string): Date | null {
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateInput(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addOneYear(yyyyMmDd: string): string | null {
  const d = new Date(yyyyMmDd);
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + 1);
  return toDateInput(d);
}

function parseMoneyToString(value: string) {
  const s = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = Number(s);
  if (!Number.isFinite(num)) return null;
  return num.toFixed(2);
}

export async function parsePolicyPdfAction(
  _: ParsePolicyPdfState,
  formData: FormData,
): Promise<ParsePolicyPdfState> {
  await requireSession();

  const file = formData.get("pdf");
  if (!file || !(file instanceof File) || file.size === 0) {
    return { error: "Selecione um PDF para ler." };
  }
  if (file.type !== "application/pdf") {
    return { error: "Envie um arquivo PDF válido." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "PDF muito grande. Envie um arquivo de até 10MB." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    let rawText = "";
    try {
      const parsed = await parser.getText();
      rawText = parsed.text || "";
    } finally {
      await parser.destroy();
    }

    const text = normalizeSpaces(rawText);
    if (!text) {
      return {
        error:
          "Não consegui ler texto desse PDF. Se ele for escaneado, precisa ser um PDF editável (com texto) para extrair automaticamente.",
      };
    }

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const cpfCnpj =
      extractFirstMatch(
        text,
        /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/,
      ) ??
      extractFirstMatch(text, /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/);

    const clientName = extractFirstByLine(lines, [
      /^(?:segurado|proponente|contratante)\s*[:\-]\s*(.+)$/i,
      /^(?:segurado|proponente|contratante)\s+(.+)$/i,
    ]);

    const insurer =
      extractFirstByLine(lines, [
        /^(?:seguradora|companhia)\s*[:\-]\s*(.+)$/i,
        /^(?:seguradora|companhia)\s+(.+)$/i,
      ]) ?? null;

    const policyNo =
      extractFirstByLine(lines, [
        /^(?:ap[oó]lice|n[ºo]\s*da\s*ap[oó]lice|n[ºo]\s*ap[oó]lice)\s*[:\-]\s*([a-z0-9\-\/\.]{4,})$/i,
        /^(?:ap[oó]lice|n[ºo]\s*da\s*ap[oó]lice|n[ºo]\s*ap[oó]lice)\s+([a-z0-9\-\/\.]{4,})$/i,
      ]) ??
      extractFirstMatch(
        text,
        /(?:ap[oó]lice|n[ºo]\s*ap[oó]lice)\s*[:\-]?\s*([a-z0-9\-\/\.]{4,})/i,
      );

    const policyType =
      extractFirstByLine(lines, [
        /^(?:ramo|tipo)\s*[:\-]\s*(.+)$/i,
        /^(?:ramo|tipo)\s+(.+)$/i,
      ]) ?? null;

    const premiumRaw =
      extractFirstMatch(
        text,
        /(?:pr[eê]mio\s*total|pr[eê]mio|valor\s*do\s*pr[eê]mio)\s*[:\-]?\s*(?:r\$\s*)?([\d\.\,]+)/i,
      ) ?? null;
    const premium = premiumRaw ? parseMoneyToString(premiumRaw) : null;

    const dateMatches = Array.from(text.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g))
      .map((m) => m[1])
      .filter(Boolean);

    let startDate: string | null = null;
    let endDate: string | null = null;

    const vigLine = lines.find((l) => /vig[eê]ncia/i.test(l));
    if (vigLine) {
      const ds = Array.from(vigLine.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g))
        .map((m) => m[1])
        .filter(Boolean);
      if (ds[0]) {
        const d0 = parsePtBrDate(ds[0]);
        if (d0) startDate = toDateInput(d0);
      }
      if (ds[1]) {
        const d1 = parsePtBrDate(ds[1]);
        if (d1) endDate = toDateInput(d1);
      }
    }

    if (!startDate && dateMatches[0]) {
      const d0 = parsePtBrDate(dateMatches[0]);
      if (d0) startDate = toDateInput(d0);
    }
    if (!endDate && dateMatches.length > 1) {
      const dLast = parsePtBrDate(dateMatches[dateMatches.length - 1]);
      if (dLast) endDate = toDateInput(dLast);
    }
    if (!endDate && startDate) endDate = addOneYear(startDate);

    const data: ParsedPolicyPdfData = {
      clientName: clientName ?? undefined,
      clientCpfCnpj: cpfCnpj ?? undefined,
      insurer: insurer ?? undefined,
      policyNo: policyNo ?? undefined,
      policyType: policyType ?? undefined,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
      premium: premium ?? undefined,
      status: "ATIVA",
    };

    return { data };
  } catch {
    return { error: "Não foi possível ler esse PDF." };
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
    clientId: formData.get("clientId"),
    clientName: formData.get("clientName"),
    clientCpfCnpj: formData.get("clientCpfCnpj"),
    clientEmail: formData.get("clientEmail") ?? "",
    clientPhone: formData.get("clientPhone") ?? "",
    clientBirthDate: formData.get("clientBirthDate") ?? "",
    clientNotes: formData.get("clientNotes") ?? "",
    insurer: formData.get("insurer"),
    policyType: formData.get("policyType"),
    policyNo: formData.get("policyNo"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    premium: formData.get("premium") ?? "",
    status: formData.get("status") ?? "ATIVA",
  });

  if (!parsed.success) return { error: "Dados inválidos. Verifique os campos." };

  try {
    const clientId =
      parsed.data.clientMode === "existing"
        ? parsed.data.clientId
        : (
            await prisma.client.upsert({
              where: { cpfCnpj: parsed.data.clientCpfCnpj.trim() },
              select: { id: true },
              create: {
                name: parsed.data.clientName.trim(),
                cpfCnpj: parsed.data.clientCpfCnpj.trim(),
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
                name: parsed.data.clientName.trim(),
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
          ).id;

    const created = await prisma.policy.create({
      data: {
        clientId,
        insurer: parsed.data.insurer.trim(),
        policyType: parsed.data.policyType.trim(),
        policyNo: parsed.data.policyNo.trim(),
        startDate: toDate(parsed.data.startDate),
        endDate: toDate(parsed.data.endDate),
        premium: parsed.data.premium?.trim() ? parsed.data.premium.trim() : null,
        status: parsed.data.status.trim(),
      },
    });

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
    clientId: formData.get("clientId"),
    insurer: formData.get("insurer"),
    policyType: formData.get("policyType"),
    policyNo: formData.get("policyNo"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    premium: formData.get("premium") ?? "",
    status: formData.get("status") ?? "ATIVA",
  });

  if (!parsed.success) return { error: "Dados inválidos. Verifique os campos." };

  try {
    await prisma.policy.update({
      where: { id: policyId },
      data: {
        clientId: parsed.data.clientId,
        insurer: parsed.data.insurer.trim(),
        policyType: parsed.data.policyType.trim(),
        policyNo: parsed.data.policyNo.trim(),
        startDate: toDate(parsed.data.startDate),
        endDate: toDate(parsed.data.endDate),
        premium: parsed.data.premium?.trim() ? parsed.data.premium.trim() : null,
        status: parsed.data.status.trim(),
      },
    });
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
  await prisma.policy.delete({ where: { id: policyId } });
  revalidatePath("/app/apolices");
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
