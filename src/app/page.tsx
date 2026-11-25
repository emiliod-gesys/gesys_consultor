import { connection } from "next/server";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { listClientSummaries } from "@/lib/client-service";
import { MODEL_NOTE, getModelConfig } from "@/lib/model";
import { Dashboard } from "@/components/dashboard";
import { PageFallback, Shell } from "@/components/shell";

export default function Page() {
  return (
    <Suspense fallback={<PageFallback label="Clientes" />}>
      <HomeScreen />
    </Suspense>
  );
}

async function HomeScreen() {
  await connection();
  await requireUser();
  const model = getModelConfig();
  let clients: Awaited<ReturnType<typeof listClientSummaries>> = [];
  let storageError: string | null = null;
  try {
    clients = await listClientSummaries();
  } catch (error) {
    storageError = error instanceof Error ? error.message : "No se pudo leer los clientes.";
  }

  return (
    <Shell>
      <Dashboard clients={clients} model={model} modelNote={MODEL_NOTE} storageError={storageError} />
    </Shell>
  );
}
