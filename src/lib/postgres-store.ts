import postgres from "postgres";
import type { StoredClient, StoredEnvironment } from "@/lib/types";
import { isEnvironment } from "@/lib/types";
import type { Store } from "@/lib/store";

type ClientRow = {
  id: string;
  name: string;
  notes: string;
  created_at: Date | string;
  updated_at: Date | string;
  environment: string | null;
  base_url: string | null;
  database_name: string | null;
  username: string | null;
  secret_ciphertext: string | null;
};

const globalSql = globalThis as unknown as { gesysSql?: ReturnType<typeof postgres> };

function sqlClient(connectionString: string) {
  if (!globalSql.gesysSql) {
    const local = /localhost|127\.0\.0\.1/.test(connectionString);
    const hasSslMode = /sslmode=/.test(connectionString);
    globalSql.gesysSql = postgres(connectionString, {
      max: 1,
      prepare: false,
      // El pooler de Supabase en el puerto 6543 no responde consultas encadenadas.
      max_pipeline: 1,
      idle_timeout: 20,
      max_lifetime: 60 * 10,
      connect_timeout: 15,
      query_timeout: 20,
      ...(hasSslMode ? {} : { ssl: local ? false : "require" }),
    });
  }
  return globalSql.gesysSql;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function environmentFromRow(row: ClientRow): StoredEnvironment | null {
  if (!row.environment || !isEnvironment(row.environment)) return null;
  if (!row.base_url || !row.database_name || !row.username || !row.secret_ciphertext) return null;
  return {
    baseUrl: row.base_url,
    databaseName: row.database_name,
    username: row.username,
    secretCiphertext: row.secret_ciphertext,
  };
}

function group(rows: ClientRow[]): StoredClient[] {
  const clients = new Map<string, StoredClient>();
  for (const row of rows) {
    let client = clients.get(row.id);
    if (!client) {
      client = {
        id: row.id,
        name: row.name,
        notes: row.notes,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        staging: null,
        production: null,
      };
      clients.set(row.id, client);
    }
    if (row.environment === "staging") client.staging = environmentFromRow(row);
    if (row.environment === "production") client.production = environmentFromRow(row);
  }
  return [...clients.values()];
}

let migrated = false;

async function schemaReady(sql: ReturnType<typeof postgres>): Promise<boolean> {
  const rows = await sql<{ ready: boolean }[]>`
    select to_regclass('public.clients') is not null
       and to_regclass('public.client_environments') is not null
       and to_regclass('public.chat_transcripts') is not null as ready
  `;
  return rows[0]?.ready === true;
}

export async function createPostgresStore(connectionString: string): Promise<Store> {
  const sql = sqlClient(connectionString);
  if (!migrated) {
    if (await schemaReady(sql)) {
      migrated = true;
    }
  }
  if (!migrated) {
    await sql`
      create table if not exists clients (
        id text primary key,
        name text not null,
        notes text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint clients_name_length check (char_length(btrim(name)) between 1 and 160),
        constraint clients_notes_length check (char_length(notes) <= 4000)
      )
    `;
    await sql`create index if not exists clients_updated_at_idx on clients (updated_at desc)`;
    await sql`
      create table if not exists client_environments (
        client_id text not null references clients (id) on delete cascade,
        environment text not null,
        base_url text not null,
        database_name text not null,
        username text not null,
        secret_ciphertext text not null,
        constraint client_environments_pk primary key (client_id, environment),
        constraint client_environments_environment check (environment in ('staging', 'production')),
        constraint client_environments_url_length check (char_length(base_url) between 1 and 300),
        constraint client_environments_database_length check (char_length(database_name) between 1 and 200),
        constraint client_environments_username_length check (char_length(username) between 1 and 200),
        constraint client_environments_secret_length check (char_length(secret_ciphertext) between 1 and 4000)
      )
    `;
    await sql`
      create table if not exists chat_transcripts (
        client_id text not null references clients (id) on delete cascade,
        environment text not null,
        messages jsonb not null,
        updated_at timestamptz not null default now(),
        constraint chat_transcripts_pk primary key (client_id, environment),
        constraint chat_transcripts_environment check (environment in ('staging', 'production'))
      )
    `;
    migrated = true;
  }

  const selectClients = async (id?: string) => {
    const rows = id
      ? await sql<ClientRow[]>`
          select c.id, c.name, c.notes, c.created_at, c.updated_at,
                 e.environment, e.base_url, e.database_name, e.username, e.secret_ciphertext
          from clients c
          left join client_environments e on e.client_id = c.id
          where c.id = ${id}
          order by c.updated_at desc, c.id
        `
      : await sql<ClientRow[]>`
          select c.id, c.name, c.notes, c.created_at, c.updated_at,
                 e.environment, e.base_url, e.database_name, e.username, e.secret_ciphertext
          from clients c
          left join client_environments e on e.client_id = c.id
          order by c.updated_at desc, c.id
        `;
    return group(rows);
  };

  return {
    listClients: () => selectClients(),
    getClient: async (id) => (await selectClients(id))[0] ?? null,
    upsertClient: async (client) => {
      await sql.begin(async (transaction) => {
        await transaction`
          insert into clients (id, name, notes, created_at, updated_at)
          values (${client.id}, ${client.name}, ${client.notes}, ${client.createdAt}, ${client.updatedAt})
          on conflict (id) do update set
            name = excluded.name,
            notes = excluded.notes,
            updated_at = excluded.updated_at
        `;
        await transaction`delete from client_environments where client_id = ${client.id}`;
        for (const environment of ["staging", "production"] as const) {
          const value = client[environment];
          if (!value) continue;
          await transaction`
            insert into client_environments (
              client_id, environment, base_url, database_name, username, secret_ciphertext
            ) values (
              ${client.id},
              ${environment},
              ${value.baseUrl},
              ${value.databaseName},
              ${value.username},
              ${value.secretCiphertext}
            )
          `;
        }
      });
    },
    deleteClient: async (id) => {
      await sql`delete from clients where id = ${id}`;
    },
    getTranscript: async (clientId, environment) => {
      const rows = await sql<{ messages: unknown }[]>`
        select messages
        from chat_transcripts
        where client_id = ${clientId} and environment = ${environment}
      `;
      return rows[0]?.messages ?? [];
    },
    setTranscript: async (clientId, environment, messages) => {
      await sql`
        insert into chat_transcripts (client_id, environment, messages, updated_at)
        values (${clientId}, ${environment}, ${sql.json(messages as postgres.JSONValue)}, now())
        on conflict (client_id, environment) do update set
          messages = excluded.messages,
          updated_at = now()
      `;
    },
  };
}
