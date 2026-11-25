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
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 sm:gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="hidden text-[0.65rem] tracking-[0.18em] text-muted sm:block">CONSULTA</p>
          <h1 className="truncate font-display text-2xl tracking-tight sm:text-4xl">{client.name}</h1>
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
      <p className="hidden shrink-0 text-xs text-muted md:line-clamp-1 md:block">
        {model.id} · razonamiento {model.effort}. {modelNote}
      </p>

      {environment === "production" && configured ? (
        <p className="shrink-0 truncate rounded-full border border-steel/40 bg-steel-deep px-3 py-1.5 text-xs text-steel" role="status">
          Producción · {hostOf(configured.baseUrl)}. Crear, borrar o publicar pide autorización.
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
      className={`h-9 rounded-full px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${checked ? active : "text-muted"}`}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}
