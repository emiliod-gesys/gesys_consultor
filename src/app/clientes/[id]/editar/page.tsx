import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getClientSummary } from "@/lib/client-service";
import { ClientForm } from "@/components/client-form";
import { PageFallback, Shell } from "@/components/shell";
import { buttonClass } from "@/components/ui";

export const metadata = { title: "Editar cliente" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageFallback label="Edición" />}>
      <EditScreen params={params} />
    </Suspense>
  );
}

async function EditScreen({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requireUser();
  const { id } = await params;
  const client = await getClientSummary(id);
  if (!client) notFound();

  return (
    <Shell
      aside={
        <Link className={buttonClass("ghost")} href={`/clientes/${client.id}`}>
          Consultar
        </Link>
      }
    >
      <div className="mb-6">
        <h1 className="font-display text-5xl tracking-tight">Editar {client.name}</h1>
        <p className="mt-3 text-muted">Si dejas la clave en blanco, se conserva la que ya está guardada.</p>
      </div>
      <ClientForm client={client} />
    </Shell>
  );
}
