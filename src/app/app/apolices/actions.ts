"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { z } from "zod";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updatePolicySchema = z.object({
  clientId: z.string().uuid().or(z.literal("")),
  insurer: z.string().optional().or(z.literal("")),
  policyType: z.string().optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
  premium: z.string().optional().or(z.literal("")),
  status: z.string().optional().or(z.literal("")),
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
