import { connection } from "next/server";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { ClientForm } from "@/components/client-form";
import { PageFallback, Shell } from "@/components/shell";

export const metadata = { title: "Nuevo cliente" };

export default function Page() {
  return (
    <Suspense fallback={<PageFallback label="Nuevo cliente" />}>
      <NewClientScreen />
    </Suspense>
  );
}

async function NewClientScreen() {
  await connection();
  await requireUser();
  return (
    <Shell>
      <div className="mb-6">
        <h1 className="font-display text-5xl tracking-tight">Nuevo cliente</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Guarda por separado la base de pruebas y la de producción. Las claves quedan cifradas en el servidor.
        </p>
      </div>
      <ClientForm />
    </Shell>
  );
}
