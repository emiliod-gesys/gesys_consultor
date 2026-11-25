import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EnvironmentName, StoredClient } from "@/lib/types";
import { isClientId, isEnvironment } from "@/lib/types";
import type { Store } from "@/lib/store";

type FileData = {
  clients: StoredClient[];
  transcripts: Record<string, unknown>;
};

const empty = (): FileData => ({ clients: [], transcripts: Object.create(null) as Record<string, unknown> });

function transcriptKey(clientId: string, environment: EnvironmentName): string {
  return `${clientId}:${environment}`;
}

export function createFileStore(): Store {
  const directory = process.env.DATA_DIR || path.join(process.cwd(), ".data");
  const file = path.join(directory, "store.json");
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function read(): Promise<FileData> {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<FileData>;
      const transcripts = Object.create(null) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed.transcripts ?? {})) {
        const [clientId, environment] = key.split(":");
        if (clientId && environment && isClientId(clientId) && isEnvironment(environment)) {
          transcripts[key] = value;
        }
      }
      return {
        clients: Array.isArray(parsed.clients) ? parsed.clients : [],
        transcripts,
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return empty();
      throw new Error("No se pudo leer el almacén local de clientes.");
    }
  }

  async function write(data: FileData): Promise<void> {
    await mkdir(directory, { recursive: true });
    const temporary = `${file}.tmp`;
    await writeFile(temporary, JSON.stringify(data));
    await rename(temporary, file);
  }

  return {
    listClients: () => enqueue(async () => (await read()).clients),
    getClient: (id) => enqueue(async () => (await read()).clients.find((client) => client.id === id) ?? null),
    upsertClient: (client) =>
      enqueue(async () => {
        const data = await read();
        const index = data.clients.findIndex((item) => item.id === client.id);
        if (index >= 0) data.clients[index] = client;
        else data.clients.push(client);
        await write(data);
      }),
    deleteClient: (id) =>
      enqueue(async () => {
        const data = await read();
        data.clients = data.clients.filter((client) => client.id !== id);
        for (const key of Object.keys(data.transcripts)) {
          if (key.startsWith(`${id}:`)) delete data.transcripts[key];
        }
        await write(data);
      }),
    getTranscript: (clientId, environment) =>
      enqueue(async () => (await read()).transcripts[transcriptKey(clientId, environment)] ?? []),
    setTranscript: (clientId, environment, messages) =>
      enqueue(async () => {
        const data = await read();
        data.transcripts[transcriptKey(clientId, environment)] = messages;
        await write(data);
      }),
  };
}
