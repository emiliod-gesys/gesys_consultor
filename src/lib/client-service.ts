import "server-only";
import { openOdoo } from "@/lib/odoo";
import { parseTranscript } from "@/lib/messages";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { assertPublicUrl } from "@/lib/ssrf";
import { getStore } from "@/lib/store";
import {
  createClientId,
  isClientId,
  type ClientDraft,
  type ClientSummary,
  type EnvironmentDraft,
  type EnvironmentName,
  type EnvironmentSummary,
  type OdooCredentials,
  type StoredClient,
  type StoredEnvironment,
} from "@/lib/types";
import type { UIMessage } from "ai";

export class ClientError extends Error {}

function toEnvironmentSummary(environment: StoredEnvironment): EnvironmentSummary {
  return {
    baseUrl: environment.baseUrl,
    databaseName: environment.databaseName,
    username: environment.username,
    hasSecret: environment.secretCiphertext.length > 0,
  };
}

export function toClientSummary(client: StoredClient): ClientSummary {
  return {
    id: client.id,
    name: client.name,
    notes: client.notes,
    updatedAt: client.updatedAt,
    staging: client.staging ? toEnvironmentSummary(client.staging) : null,
    production: client.production ? toEnvironmentSummary(client.production) : null,
  };
}

export async function listClientSummaries(): Promise<ClientSummary[]> {
  const clients = await (await getStore()).listClients();
  return clients
    .map(toClientSummary)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getClientSummary(id: string): Promise<ClientSummary | null> {
  if (!isClientId(id)) return null;
  const client = await (await getStore()).getClient(id);
  return client ? toClientSummary(client) : null;
}

export async function getCredentials(
  id: string,
  environment: EnvironmentName,
): Promise<{ client: ClientSummary; credentials: OdooCredentials } | null> {
  if (!isClientId(id)) return null;
  const client = await (await getStore()).getClient(id);
  const stored = client?.[environment];
  if (!client || !stored) return null;
  return {
    client: toClientSummary(client),
    credentials: {
      baseUrl: stored.baseUrl,
      databaseName: stored.databaseName,
      username: stored.username,
      secret: decryptSecret(stored.secretCiphertext),
    },
  };
}

async function resolveEnvironment(
  draft: EnvironmentDraft,
  existing: StoredEnvironment | null,
  label: string,
): Promise<StoredEnvironment | null> {
  const baseUrl = draft.baseUrl.trim();
  const databaseName = draft.databaseName.trim();
  const username = draft.username.trim();
  const secret = draft.secret.trim();
  if (!baseUrl && !databaseName && !username) return null;
  if (!baseUrl || !databaseName || !username) {
    throw new ClientError(`Completa URL, base de datos y usuario de ${label}.`);
  }
  if (databaseName.length > 200 || username.length > 200 || /[\r\n\0]/.test(`${databaseName}${username}`)) {
    throw new ClientError(`Los datos de ${label} no son válidos.`);
  }

  let normalized: string;
  try {
    normalized = await assertPublicUrl(baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "URL no válida.";
    throw new ClientError(`${label}: ${message}`);
  }

  const secretCiphertext = secret ? encryptSecret(secret) : existing?.secretCiphertext;
  if (!secretCiphertext) throw new ClientError(`Falta la clave de acceso de ${label}.`);
  return { baseUrl: normalized, databaseName, username, secretCiphertext };
}

export async function saveClientDraft(draft: ClientDraft): Promise<string> {
  const store = await getStore();
  if (draft.id && !isClientId(draft.id)) throw new ClientError("Identificador no válido.");
  const existing = draft.id ? await store.getClient(draft.id) : null;
  if (draft.id && !existing) throw new ClientError("Ese cliente no existe.");

  const name = draft.name.trim();
  const notes = draft.notes.trim();
  if (name.length < 1 || name.length > 160) {
    throw new ClientError("El nombre debe tener entre 1 y 160 caracteres.");
  }
  if (notes.length > 4000) throw new ClientError("Las notas superan los 4000 caracteres.");

  const staging = await resolveEnvironment(draft.staging, existing?.staging ?? null, "pruebas");
  const production = await resolveEnvironment(draft.production, existing?.production ?? null, "producción");
  if (!staging && !production) {
    throw new ClientError("Configura al menos la base de pruebas o la de producción.");
  }

  const now = new Date().toISOString();
  const client: StoredClient = {
    id: existing?.id ?? createClientId(),
    name,
    notes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    staging,
    production,
  };
  await store.upsertClient(client);
  return client.id;
}

export async function removeClient(id: string): Promise<void> {
  if (!isClientId(id)) throw new ClientError("Identificador no válido.");
  await (await getStore()).deleteClient(id);
}

export async function testEnvironment(input: {
  clientId?: string;
  environment: EnvironmentName;
  draft: EnvironmentDraft;
}): Promise<{ version: string; uid: number }> {
  const existing =
    input.clientId && isClientId(input.clientId)
      ? await (await getStore()).getClient(input.clientId)
      : null;
  const stored = existing?.[input.environment] ?? null;
  const secret = input.draft.secret.trim() || (stored ? decryptSecret(stored.secretCiphertext) : "");
  if (!secret) throw new ClientError("Escribe la clave para probar la conexión.");
  const databaseName = input.draft.databaseName.trim();
  const username = input.draft.username.trim();
  if (!databaseName || !username) throw new ClientError("Completa la base de datos y el usuario.");

  const session = await openOdoo({
    baseUrl: input.draft.baseUrl,
    databaseName,
    username,
    secret,
  });
  return { version: session.version, uid: session.uid };
}

export async function loadTranscript(clientId: string, environment: EnvironmentName): Promise<UIMessage[]> {
  if (!isClientId(clientId)) return [];
  const value = await (await getStore()).getTranscript(clientId, environment);
  return parseTranscript(value);
}

export async function saveTranscript(
  clientId: string,
  environment: EnvironmentName,
  messages: UIMessage[],
): Promise<void> {
  if (!isClientId(clientId)) return;
  await (await getStore()).setTranscript(clientId, environment, messages);
}
