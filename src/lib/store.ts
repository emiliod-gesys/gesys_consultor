import type { EnvironmentName, StoredClient } from "@/lib/types";

export interface Store {
  listClients(): Promise<StoredClient[]>;
  getClient(id: string): Promise<StoredClient | null>;
  upsertClient(client: StoredClient): Promise<void>;
  deleteClient(id: string): Promise<void>;
  getTranscript(clientId: string, environment: EnvironmentName): Promise<unknown>;
  setTranscript(clientId: string, environment: EnvironmentName, messages: unknown): Promise<void>;
}

let storePromise: Promise<Store> | undefined;

export function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = openStore().catch((error: unknown) => {
      storePromise = undefined;
      throw error;
    });
  }
  return storePromise;
}

async function openStore(): Promise<Store> {
  if (process.env.DATABASE_URL) {
    const { createPostgresStore } = await import("@/lib/postgres-store");
    return createPostgresStore(process.env.DATABASE_URL);
  }
  if (process.env.VERCEL) {
    throw new Error(
      "En Vercel hace falta DATABASE_URL. Enlaza el pooler de Supabase (puerto 6543). El disco de la función no conserva los clientes.",
    );
  }
  const { createFileStore } = await import("@/lib/file-store");
  return createFileStore();
}
