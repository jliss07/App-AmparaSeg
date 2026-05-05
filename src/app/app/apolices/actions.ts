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

function isLowQualityPdfText(rawText: string) {
  const trimmed = rawText.trim();
  if (!trimmed) return true;
  const withoutWhitespace = trimmed.replace(/\s+/g, "");
  if (withoutWhitespace.length < 350) return true;

  const withoutPageMarkers = trimmed
    .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, " ")
    .replace(/^\s*\d+\s*\/\s*\d+\s*$/gm, " ")
    .trim();
  const alphaNumCount = (withoutPageMarkers.match(/[A-Za-zÀ-ÿ0-9]/g) ?? []).length;
  if (alphaNumCount < 200) return true;

  return false;
}

async function extractTextFromPdfBuffer(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return parsed.text || "";
  } finally {
    await parser.destroy();
  }
}

type AdobeTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type AdobeUploadResponse = {
  assetID: string;
  uploadUri: string;
};

type AdobeDownloadResponse = {
  downloadUri: string;
  size?: number;
  type?: string;
};

type AdobeJobStatusResponse = {
  status?: string;
  asset?: { assetID?: string; downloadUri?: string };
  assetID?: string;
  downloadUri?: string;
  dowloadUri?: string;
  result?: unknown;
  error?: { code?: string; message?: string };
};

function getPdfServicesBaseUrls() {
  const envBase = process.env.PDF_SERVICES_BASE_URL?.trim();
  const urls = [
    envBase || null,
    "https://pdf-services-ue1.adobe.io",
    "https://pdf-services-ew1.adobe.io",
    "https://pdf-services.adobe.io",
  ].filter(Boolean) as string[];

  return Array.from(new Set(urls));
}

function resolveAdobeLocation(baseUrl: string, location: string) {
  const trimmed = location.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return `${baseUrl}${trimmed}`;
  return `${baseUrl}/${trimmed}`;
}

async function adobeFetchJson<T>(
  url: string,
  init: RequestInit,
): Promise<{ ok: true; status: number; headers: Headers; json: T } | { ok: false; status: number; text: string }> {
  const res = await fetch(url, init);
  const status = res.status;
  const headers = res.headers;
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status, text };
  }
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    return { ok: false, status, text };
  }
  const json = (await res.json()) as T;
  return { ok: true, status, headers, json };
}

async function getAdobeAccessToken(baseUrl: string, clientId: string, clientSecret: string) {
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const res = await adobeFetchJson<AdobeTokenResponse>(`${baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) throw new Error("token_failed");
  if (!res.json.access_token) throw new Error("token_missing");
  return res.json.access_token;
}

async function uploadAdobeAsset(
  baseUrl: string,
  token: string,
  clientId: string,
): Promise<AdobeUploadResponse> {
  const res = await adobeFetchJson<AdobeUploadResponse>(`${baseUrl}/assets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-api-key": clientId,
    },
    body: JSON.stringify({ mediaType: "application/pdf" }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error("assets_failed");
  if (!res.json.assetID || !res.json.uploadUri) throw new Error("assets_invalid");
  return res.json;
}

async function putToUploadUri(uploadUri: string, pdfBuffer: Buffer) {
  const res = await fetch(uploadUri, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: new Uint8Array(pdfBuffer),
  });
  if (!res.ok) throw new Error("upload_failed");
}

async function submitAdobeOcrJob(
  baseUrl: string,
  token: string,
  clientId: string,
  assetID: string,
) {
  const res = await fetch(`${baseUrl}/operation/ocr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-api-key": clientId,
    },
    body: JSON.stringify({ assetID }),
    cache: "no-store",
  });
  if (res.status !== 201) throw new Error("ocr_submit_failed");
  const location = res.headers.get("location");
  if (!location) throw new Error("ocr_location_missing");
  return resolveAdobeLocation(baseUrl, location);
}

function extractAdobeJobResult(
  json: AdobeJobStatusResponse,
): { status: string; downloadUri?: string; assetId?: string; errorMessage?: string } {
  const status = String(json.status ?? "").toLowerCase();
  const downloadUri =
    json.downloadUri ??
    json.dowloadUri ??
    json.asset?.downloadUri ??
    ((json.result as any)?.downloadUri as string | undefined) ??
    ((json.result as any)?.asset?.downloadUri as string | undefined);

  const assetId =
    json.asset?.assetID ??
    json.assetID ??
    ((json.result as any)?.asset?.assetID as string | undefined) ??
    ((json.result as any)?.assetID as string | undefined);

  const errorMessage =
    json.error?.message ??
    ((json.result as any)?.error?.message as string | undefined) ??
    ((json as any)?.message as string | undefined);

  return { status, downloadUri, assetId, errorMessage };
}

async function pollAdobeJobForResult(
  pollingUrl: string,
  token: string,
  clientId: string,
) {
  const maxAttempts = 18;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await adobeFetchJson<AdobeJobStatusResponse>(pollingUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": clientId,
      },
      cache: "no-store",
    });

    if (res.ok) {
      const { status, downloadUri, assetId, errorMessage } = extractAdobeJobResult(res.json);
      if (status.includes("done")) {
        if (downloadUri) return { downloadUri };
        if (assetId) return { assetId };
        throw new Error("ocr_done_missing_result");
      }
      if (status.includes("failed") || status.includes("error")) {
        if (errorMessage) throw new Error(`ocr_failed:${errorMessage}`);
        throw new Error("ocr_failed");
      }
    }

    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("ocr_timeout");
}

async function getAdobeDownloadUri(
  baseUrl: string,
  token: string,
  clientId: string,
  assetId: string,
) {
  const encoded = encodeURIComponent(assetId);
  const res = await adobeFetchJson<AdobeDownloadResponse>(`${baseUrl}/assets/${encoded}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-key": clientId,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("download_uri_failed");
  if (!res.json.downloadUri) throw new Error("download_uri_missing");
  return res.json.downloadUri;
}

async function adobeOcrAndExtractText(pdfBuffer: Buffer) {
  const clientId =
    process.env.PDF_SERVICES_CLIENT_ID?.trim() ||
    process.env.ADOBE_PDF_SERVICES_CLIENT_ID?.trim() ||
    process.env.ADOBE_CLIENT_ID?.trim() ||
    "";
  const clientSecret =
    process.env.PDF_SERVICES_CLIENT_SECRET?.trim() ||
    process.env.ADOBE_PDF_SERVICES_CLIENT_SECRET?.trim() ||
    process.env.ADOBE_CLIENT_SECRET?.trim() ||
    "";
  if (!clientId || !clientSecret) throw new Error("missing_adobe_credentials");

  const baseUrls = getPdfServicesBaseUrls();
  let lastError: unknown = null;

  for (const baseUrl of baseUrls) {
    try {
      const token = await getAdobeAccessToken(baseUrl, clientId, clientSecret);
      const { assetID, uploadUri } = await uploadAdobeAsset(baseUrl, token, clientId);
      await putToUploadUri(uploadUri, pdfBuffer);
      const pollingUrl = await submitAdobeOcrJob(baseUrl, token, clientId, assetID);
      const jobResult = await pollAdobeJobForResult(pollingUrl, token, clientId);
      const downloadUri =
        jobResult.downloadUri ??
        (jobResult.assetId
          ? await getAdobeDownloadUri(baseUrl, token, clientId, jobResult.assetId)
          : null);
      if (!downloadUri) throw new Error("download_uri_missing");
      const res = await fetch(downloadUri, { cache: "no-store" });
      if (!res.ok) throw new Error("download_failed");
      const ocrBuffer = Buffer.from(await res.arrayBuffer());
      return await extractTextFromPdfBuffer(ocrBuffer);
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError ?? new Error("adobe_ocr_failed");
}

function getOcrFriendlyErrorMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : "";
  if (msg === "missing_adobe_credentials") {
    return "OCR não configurado. Configure PDF_SERVICES_CLIENT_ID e PDF_SERVICES_CLIENT_SECRET no Vercel.";
  }
  if (msg.includes("token_failed") || msg.includes("assets_failed") || msg.includes("ocr_submit_failed")) {
    return "O OCR (Adobe PDF Services) falhou ao iniciar. Verifique as credenciais e a região (UE1/EW1).";
  }
  if (msg.startsWith("ocr_failed:")) {
    return `O OCR (Adobe PDF Services) falhou: ${msg.slice("ocr_failed:".length).trim() || "erro desconhecido"}.`;
  }
  if (msg === "ocr_timeout") {
    return "O OCR demorou demais para concluir. Tente novamente em alguns instantes.";
  }
  return "O OCR (Adobe PDF Services) não está disponível (ou falhou).";
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
    let rawText = await extractTextFromPdfBuffer(buffer);
    if (isLowQualityPdfText(rawText)) {
      try {
        rawText = await adobeOcrAndExtractText(buffer);
      } catch (e) {
        if (!rawText.trim()) {
          return {
            error: `Não consegui ler texto desse PDF. Ele parece escaneado. ${getOcrFriendlyErrorMessage(e)}`,
          };
        }
      }
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
