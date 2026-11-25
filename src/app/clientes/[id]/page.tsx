import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getClientSummary, loadTranscript } from "@/lib/client-service";
import { MODEL_NOTE, getModelConfig } from "@/lib/model";
import { ChatWorkspace } from "@/components/chat-workspace";
import { PageFallback, Shell } from "@/components/shell";
import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageFallback label="Consulta" />}>
      <ClientScreen params={params} />
    </Suspense>
  );
}

async function ClientScreen({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requireUser();
  const { id } = await params;
  const client = await getClientSummary(id);
  if (!client) notFound();
  const [staging, production] = await Promise.all([
    loadTranscript(id, "staging"),
    loadTranscript(id, "production"),
  ]);

  return (
    <Shell
      fill
      aside={
        <Link className={buttonClass("ghost")} href={`/clientes/${client.id}/editar`}>
          Editar
        </Link>
      }
    >
      <ChatWorkspace
        client={client}
        transcripts={{ staging, production }}
        model={getModelConfig()}
        modelNote={MODEL_NOTE}
      />
    </Shell>
  );
}
