"use client";

import { BrandLogo } from "@/components/brand";
import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
      <BrandLogo className="w-56" />
      <h1 className="mt-6 font-display text-5xl">No se pudo cargar</h1>
      <p className="mt-3 text-muted">La pantalla falló al pedir los datos. Puedes intentar de nuevo.</p>
      <Button className="mt-6 w-fit" onClick={reset}>
        Reintentar
      </Button>
    </main>
  );
}
