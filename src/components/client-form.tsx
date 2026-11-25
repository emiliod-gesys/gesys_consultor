"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteClient, saveClient, testClientConnection } from "@/app/actions";
import type { ClientDraft, ClientSummary, EnvironmentDraft, EnvironmentName } from "@/lib/types";
import { Button, Field, fieldClass } from "@/components/ui";

const emptyDraft: EnvironmentDraft = {
  baseUrl: "",
  databaseName: "",
  username: "",
  secret: "",
};

function fromSummary(environment: ClientSummary["staging"]): EnvironmentDraft {
  if (!environment) return emptyDraft;
  return {
    baseUrl: environment.baseUrl,
    databaseName: environment.databaseName,
    username: environment.username,
    secret: "",
  };
}

export function ClientForm({ client }: { client?: ClientSummary }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"save" | "delete" | EnvironmentName | null>(null);
  const [name, setName] = useState(client?.name ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [staging, setStaging] = useState<EnvironmentDraft>(fromSummary(client?.staging ?? null));
  const [production, setProduction] = useState<EnvironmentDraft>(fromSummary(client?.production ?? null));
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Partial<Record<EnvironmentName, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  function update(environment: EnvironmentName, field: keyof EnvironmentDraft, value: string) {
    const setter = environment === "staging" ? setStaging : setProduction;
    setter((current) => ({ ...current, [field]: value }));
  }

  function draft(): ClientDraft {
    return {
      id: client?.id,
      name,
      notes,
      staging,
      production,
    };
  }

  function run(action: "save" | "delete" | EnvironmentName, task: () => Promise<void>) {
    setError(null);
    setBusy(action);
    startTransition(async () => {
      try {
        await task();
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-6"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        run("save", async () => {
          const result = await saveClient(draft());
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/clientes/${result.id}`);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del cliente">
          <input
            className={fieldClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={160}
          />
        </Field>
        <Field label="Notas" hint="Opcional">
          <input
            className={fieldClass}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={4000}
          />
        </Field>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EnvironmentPanel
          title="Pruebas"
          description="Base donde puedes explorar sin tocar la operación diaria."
          tone="staging"
          value={staging}
          hasSecret={Boolean(client?.staging?.hasSecret)}
          pending={pending && busy === "staging"}
          result={tests.staging}
          onChange={(field, value) => update("staging", field, value)}
          onTest={() =>
            run("staging", async () => {
              const result = await testClientConnection({
                clientId: client?.id,
                environment: "staging",
                draft: staging,
              });
              setTests((current) => ({
                ...current,
                staging: result.ok
                  ? `Conectado · Odoo ${result.version} · uid ${result.uid}`
                  : result.error,
              }));
            })
          }
        />
        <EnvironmentPanel
          title="Producción"
          description="Cada consulta pide confirmación. El asistente no puede escribir."
          tone="production"
          value={production}
          hasSecret={Boolean(client?.production?.hasSecret)}
          pending={pending && busy === "production"}
          result={tests.production}
          onChange={(field, value) => update("production", field, value)}
          onTest={() =>
            run("production", async () => {
              const result = await testClientConnection({
                clientId: client?.id,
                environment: "production",
                draft: production,
              });
              setTests((current) => ({
                ...current,
                production: result.ok
                  ? `Conectado · Odoo ${result.version} · uid ${result.uid}`
                  : result.error,
              }));
            })
          }
        />
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {busy === "save" ? "Guardando…" : "Guardar cliente"}
        </Button>
        {client ? (
          <Button variant="danger" disabled={pending} onClick={() => setConfirmDelete(true)}>
            Eliminar cliente
          </Button>
        ) : null}
      </div>

      {confirmDelete && client ? (
        <div className="rounded-3xl border border-teal/40 bg-teal-deep p-4" role="alertdialog" aria-label="Eliminar cliente">
          <p>
            ¿Eliminar a <strong>{client.name}</strong>? Se borran las credenciales y las conversaciones guardadas.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                run("delete", async () => {
                  const result = await deleteClient(client.id);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.push("/");
                  router.refresh();
                })
              }
            >
              {busy === "delete" ? "Eliminando…" : "Sí, eliminar"}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function EnvironmentPanel({
  title,
  description,
  tone,
  value,
  hasSecret,
  pending,
  result,
  onChange,
  onTest,
}: {
  title: string;
  description: string;
  tone: "staging" | "production";
  value: EnvironmentDraft;
  hasSecret: boolean;
  pending: boolean;
  result?: string;
  onChange: (field: keyof EnvironmentDraft, value: string) => void;
  onTest: () => void;
}) {
  const border = tone === "production" ? "border-steel/40" : "border-line";
  return (
    <section className={`flex flex-col gap-4 rounded-[1.7rem] border ${border} bg-panel p-5`}>
      <div>
        <h2 className="font-display text-3xl">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <Field label="URL de Odoo" hint="https://…">
        <input
          className={fieldClass}
          value={value.baseUrl}
          onChange={(event) => onChange("baseUrl", event.target.value)}
          placeholder="https://cliente.odoo.com"
          inputMode="url"
        />
      </Field>
      <Field label="Base de datos">
        <input
          className={fieldClass}
          value={value.databaseName}
          onChange={(event) => onChange("databaseName", event.target.value)}
        />
      </Field>
      <Field label="Usuario">
        <input
          className={fieldClass}
          value={value.username}
          onChange={(event) => onChange("username", event.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="Clave API o contraseña" hint={hasSecret ? "Guardada" : undefined}>
        <input
          className={fieldClass}
          type="password"
          value={value.secret}
          onChange={(event) => onChange("secret", event.target.value)}
          placeholder={hasSecret ? "Escribe otra solo para reemplazarla" : "Clave API del usuario"}
          autoComplete="new-password"
        />
      </Field>
      <p className="text-xs text-muted">En Odoo Online y Odoo.sh usa la clave API del usuario. Deja la sección vacía si aún no la tienes.</p>
      <div>
        <Button variant={tone === "production" ? "steel" : "ghost"} disabled={pending} onClick={onTest}>
          {pending ? "Probando…" : "Probar conexión"}
        </Button>
      </div>
      {result ? <p className="text-sm text-muted">{result}</p> : null}
    </section>
  );
}
