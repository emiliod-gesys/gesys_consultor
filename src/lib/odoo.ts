import { assertPublicUrl } from "./ssrf";
import type { OdooCredentials } from "./types";

export type OdooSession = {
  version: string;
  uid: number;
  execute: (
    model: string,
    method: "search_read" | "search_count" | "read" | "fields_get",
    args: unknown[],
    kwargs: Record<string, unknown>,
  ) => Promise<unknown>;
};

const ALLOWED_METHODS = new Set(["search_read", "search_count", "read", "fields_get"]);

function cleanError(message: string, secret: string): string {
  const redacted = secret ? message.replaceAll(secret, "••••") : message;
  return redacted.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function rpc(baseUrl: string, service: string, method: string, args: unknown[], secret: string) {
  const endpoint = `${baseUrl}/jsonrpc`;
  await assertPublicUrl(endpoint);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "GesysConsultor/1.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: 1,
        params: { service, method, args },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sin detalle";
    throw new Error(cleanError(`No se pudo contactar Odoo: ${message}`, secret));
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error("La URL de Odoo redirigió. Guarda la dirección final, sin redirecciones.");
  }

  const body = await response.text();
  let payload: {
    result?: unknown;
    error?: { message?: string; data?: { message?: string } };
  };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    throw new Error(`Odoo no devolvió JSON (HTTP ${response.status}). Revisa la URL de la base.`);
  }

  if (!response.ok || payload.error) {
    const message = payload.error?.data?.message || payload.error?.message || `HTTP ${response.status}`;
    throw new Error(cleanError(message, secret));
  }
  return payload.result;
}

export async function openOdoo(credentials: OdooCredentials): Promise<OdooSession> {
  const baseUrl = await assertPublicUrl(credentials.baseUrl);
  const versionInfo = await rpc(baseUrl, "common", "version", [], credentials.secret);
  const version =
    versionInfo && typeof versionInfo === "object" && "server_version" in versionInfo
      ? String(versionInfo.server_version)
      : "desconocida";
  const uid = await rpc(
    baseUrl,
    "common",
    "authenticate",
    [credentials.databaseName, credentials.username, credentials.secret, {}],
    credentials.secret,
  );
  if (typeof uid !== "number" || uid <= 0) {
    throw new Error("Odoo rechazó el usuario o la clave de esa base.");
  }

  return {
    version,
    uid,
    execute: (model, method, args, kwargs) => {
      if (!/^[A-Za-z0-9_.]+$/.test(model)) throw new Error("Nombre de modelo no válido.");
      if (!ALLOWED_METHODS.has(method)) throw new Error("Esa operación no está permitida.");
      return rpc(
        baseUrl,
        "object",
        "execute_kw",
        [credentials.databaseName, uid, credentials.secret, model, method, args, kwargs],
        credentials.secret,
      );
    },
  };
}
