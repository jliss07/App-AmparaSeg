import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { PolicyForm } from "../PolicyForm";
import { createPolicyAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewPolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string }>;
}) {
  const { clienteId } = await searchParams;
  let clients: Array<{ id: string; name: string }> = [];
  try {
    clients = await prisma.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    });
  } catch {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        Configure o banco de dados para cadastrar apólices.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Nova apólice
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastre uma apólice e anexe o PDF quando disponível.
          </p>
        </div>
        <Link
          href="/app/apolices"
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted"
        >
          Voltar
        </Link>
      </div>

      <PolicyForm
        clients={clients}
        initialValues={{
          clientId: clienteId ?? "",
          status: "ATIVA",
        }}
        action={createPolicyAction}
        submitLabel="Cadastrar"
        allowPdfUpload
        allowInlineClientCreate
      />
    </div>
  );
}
