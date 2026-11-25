"use client";

import Link from "next/link";
import { useState } from "react";
import { hostOf } from "@/lib/format";
import type { ClientSummary, EnvironmentName, ModelConfig } from "@/lib/types";
import type { UIMessage } from "ai";
import { ChatThread } from "@/components/chat-thread";
import { buttonClass } from "@/components/ui";

export function ChatWorkspace({
  client,
  transcripts,
  model,
  modelNote,
}: {
  client: ClientSummary;
  transcripts: Record<EnvironmentName, UIMessage[]>;
  model: ModelConfig;
  modelNote: string;
}) {
  const [environment, setEnvironment] = useState<EnvironmentName>(client.staging ? "staging" : "production");
  const configured = client[environment];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.18em] text-muted">CONSULTA</p>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">{client.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            {model.id} · razonamiento {model.effort}. {modelNote}
          </p>
        </div>
        <div className="flex rounded-full border border-line bg-panel p-1" role="radiogroup" aria-label="Base de datos">
          <EnvironmentButton
            label="Pruebas"
            checked={environment === "staging"}
            available={Boolean(client.staging)}
            onSelect={() => setEnvironment("staging")}
          />
          <EnvironmentButton
            label="Producción"
            checked={environment === "production"}
            available={Boolean(client.production)}
            production
            onSelect={() => setEnvironment("production")}
          />
        </div>
      </div>

      {environment === "production" && configured ? (
        <p className="rounded-3xl border border-steel/40 bg-steel-deep px-4 py-3 text-sm text-steel" role="status">
          Estás en la base de producción de {hostOf(configured.baseUrl)}. Cada envío pide confirmación. El asistente
          solo lee.
        </p>
      ) : null}

      {client.staging ? (
        <div className={environment === "staging" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <ChatThread
            client={client}
            environment="staging"
            configured={client.staging}
            initialMessages={transcripts.staging}
            modelReady={model.ready}
          />
        </div>
      ) : null}
      {client.production ? (
        <div className={environment === "production" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <ChatThread
            client={client}
            environment="production"
            configured={client.production}
            initialMessages={transcripts.production}
            modelReady={model.ready}
          />
        </div>
      ) : null}
      {!configured ? (
        <div className="rounded-[1.7rem] border border-dashed border-line px-6 py-12">
          <p className="font-display text-3xl">Esta base no está configurada</p>
          <Link className={`${buttonClass("ghost")} mt-4`} href={`/clientes/${client.id}/editar`}>
            Completar credenciales
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function EnvironmentButton({
  label,
  checked,
  available,
  production = false,
  onSelect,
}: {
  label: string;
  checked: boolean;
  available: boolean;
  production?: boolean;
  onSelect: () => void;
}) {
  const active = production ? "bg-steel-deep text-steel" : "bg-teal-deep text-teal";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={!available}
      title={available ? label : `${label} sin configurar`}
      className={`h-11 rounded-full px-4 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${checked ? active : "text-muted"}`}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}
