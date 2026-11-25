"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { login } from "@/app/actions";
import { BrandLogo } from "@/components/brand";
import { Button, Field, fieldClass } from "@/components/ui";

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <BrandLogo className="w-72" />
      <h1 className="mt-6 font-display text-5xl tracking-tight">Consultor</h1>
      <p className="mt-3 text-muted">Entra para ver los clientes y consultar sus bases de Odoo.</p>
      <form
        className="mt-8 flex flex-col gap-4 rounded-[1.7rem] border border-line bg-panel p-5"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await login(password);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push("/");
            router.refresh();
          });
        }}
      >
        <Field label="Contraseña">
          <input
            className={fieldClass}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        {!configured ? (
          <p className="text-sm text-danger" role="alert">
            Configura APP_PASSWORD en el entorno del servidor antes de entrar.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending || !configured}>
          {pending ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </main>
  );
}
