"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { hostOf } from "@/lib/format";
import type { ClientSummary, ModelConfig } from "@/lib/types";
import { buttonClass } from "@/components/ui";

export function Dashboard({
  clients,
  model,
  modelNote,
  storageError,
}: {
  clients: ClientSummary[];
  model: ModelConfig;
  modelNote: string;
  storageError: string | null;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((client) => {
      const haystack = [
        client.name,
        client.notes,
        client.staging?.baseUrl,
        client.staging?.databaseName,
        client.production?.baseUrl,
        client.production?.databaseName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [clients, query]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-5xl tracking-tight text-paper">Clientes</h1>
          <p className="mt-3 max-w-xl text-muted">
            Cada cuenta guarda su Odoo de pruebas y el de producción. El asistente solo lee la base que elijas.
          </p>
        </div>
        <Link className={buttonClass("solid")} href="/clientes/nuevo">
          Nuevo cliente
        </Link>
      </div>

      {storageError ? (
        <p className="rounded-3xl border border-teal/40 bg-teal-deep px-4 py-3 text-sm text-teal" role="alert">
          {storageError}
        </p>
      ) : null}

      <p className="rounded-3xl border border-line bg-panel px-4 py-3 text-sm text-muted">
        {model.ready ? (
          <>
            Asistente listo · <span className="text-paper">{model.id}</span> · razonamiento {model.effort}. {modelNote}
          </>
        ) : (
          <>
            Falta <span className="text-paper">GEMINI_API_KEY</span>. Créala en Google AI Studio y ponla en el entorno
            del servidor. {modelNote}
          </>
        )}
      </p>

      <label className="block max-w-md">
        <span className="sr-only">Buscar clientes</span>
        <input
          className="w-full rounded-full border border-line bg-panel px-4 py-3 text-paper outline-none placeholder:text-muted/70"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre o base"
        />
      </label>

      {clients.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-line px-6 py-16 text-center">
          <p className="font-display text-3xl">Todavía no hay clientes</p>
          <p className="mx-auto mt-3 max-w-md text-muted">
            Agrega el primero con la URL, la base, el usuario y la clave API de Odoo.
          </p>
        </div>
      ) : null}

      {clients.length > 0 && filtered.length === 0 ? (
        <p className="text-muted">Ningún cliente coincide con la búsqueda.</p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2">
        {filtered.map((client, index) => (
          <li key={client.id}>
            <article className="flex h-full flex-col rounded-[1.7rem] border border-line bg-panel p-5">
              <p className="text-xs tracking-[0.18em] text-muted">{String(index + 1).padStart(2, "0")}</p>
              <h2 className="mt-2 font-display text-3xl tracking-tight">{client.name}</h2>
              {client.notes ? <p className="mt-2 line-clamp-2 text-sm text-muted">{client.notes}</p> : null}
              <div className="mt-5 flex flex-col gap-2 text-sm">
                <EnvironmentLine label="Pruebas" environment={client.staging} tone="staging" />
                <EnvironmentLine label="Producción" environment={client.production} tone="production" />
              </div>
              <div className="mt-6 flex gap-2">
                <Link className={buttonClass("teal")} href={`/clientes/${client.id}`}>
                  Consultar
                </Link>
                <Link className={buttonClass("ghost")} href={`/clientes/${client.id}/editar`}>
                  Editar
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EnvironmentLine({
  label,
  environment,
  tone,
}: {
  label: string;
  environment: ClientSummary["staging"];
  tone: "staging" | "production";
}) {
  const dot = tone === "production" ? "bg-steel" : "bg-teal";
  return (
    <p className="flex items-center gap-2">
      <span className={`size-2 rounded-full ${environment ? dot : "bg-line"}`} />
      <span className="text-muted">{label}</span>
      <span className="truncate text-paper">
        {environment ? hostOf(environment.baseUrl) : "Sin configurar"}
      </span>
    </p>
  );
}
