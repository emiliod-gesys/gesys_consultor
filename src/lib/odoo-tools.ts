import { tool } from "ai";
import { z } from "zod";
import type { OdooSession } from "./odoo";

const modelName = z
  .string()
  .regex(/^[A-Za-z0-9_.]+$/)
  .max(80)
  .describe("Nombre técnico del modelo, por ejemplo sale.order o res.partner.");

const domain = z
  .array(z.any())
  .max(80)
  .optional()
  .describe('Dominio de Odoo. Ejemplo: [["state","=","sale"],["amount_total",">",1000]].');

const fields = z.array(z.string().max(64)).max(30).optional().describe("Campos a devolver. Omite binarios y contraseñas.");

const SENSITIVE_KEY = /password|passwd|api_key|secret|token|credential|private_key|^datas$/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 2000) {
      return `${value.slice(0, 180)}… [${value.length} caracteres]`;
    }
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? "[oculto]" : redact(item);
  }
  return output;
}

function bound(value: unknown): unknown {
  const cleaned = redact(value);
  const serialized = JSON.stringify(cleaned);
  if (serialized.length <= 48_000) return cleaned;
  if (Array.isArray(cleaned)) {
    return {
      truncated: true,
      count: cleaned.length,
      records: cleaned.slice(0, 12),
    };
  }
  return { truncated: true, preview: serialized.slice(0, 48_000) };
}

function safeOrder(order: string | undefined): string | undefined {
  if (!order) return undefined;
  return /^[A-Za-z0-9_., ]+$/.test(order) ? order.slice(0, 80) : undefined;
}

const primitive = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]);

const odooValue = z.union([primitive, z.array(z.union([primitive, z.array(primitive).max(8)])).max(40)]);

const recordValues = z
  .record(z.string().regex(/^[A-Za-z0-9_]+$/).max(64), odooValue)
  .refine((value) => {
    const keys = Object.keys(value);
    return keys.length > 0 && keys.length <= 40 && keys.every((key) => !SENSITIVE_KEY.test(key));
  }, "Los valores están vacíos, son demasiados o incluyen un campo sensible.");

const resumen = z
  .string()
  .trim()
  .min(8)
  .max(240)
  .describe("Frase corta, en español, de lo que va a ocurrir. La persona la verá antes de autorizar.");

const ids = z.array(z.number().int().positive()).min(1).max(20);

function previewValues(values: Record<string, unknown>): string {
  return Object.entries(values)
    .slice(0, 8)
    .map(([key, value]) => {
      const text = JSON.stringify(value);
      return `${key}=${text.length > 48 ? `${text.slice(0, 48)}…` : text}`;
    })
    .join(", ");
}

export function describeMutation(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "Cambio en Odoo.";
  const data = input as { resumen?: unknown; model?: unknown; ids?: unknown; values?: unknown };
  const phrase = typeof data.resumen === "string" && data.resumen.trim() ? data.resumen.trim() : "Cambio en Odoo.";
  const model = typeof data.model === "string" ? data.model : "el modelo";
  const idList = Array.isArray(data.ids) ? data.ids.filter((item) => typeof item === "number").join(", ") : "";
  if (name === "odoo_create" && data.values && typeof data.values === "object") {
    return `${phrase} Creará un registro en ${model}: ${previewValues(data.values as Record<string, unknown>)}.`;
  }
  if (name === "odoo_unlink") return `${phrase} Borrará en ${model} los ids ${idList}.`;
  if (name === "odoo_publish") return `${phrase} Publicará en ${model} los ids ${idList}.`;
  return phrase;
}

const MUTATION_TOOLS = new Set(["odoo_create", "odoo_unlink", "odoo_publish"]);

export function mutationApproval(toolName: string, input: unknown) {
  if (!MUTATION_TOOLS.has(toolName)) return undefined;
  return { type: "user-approval" as const, reason: describeMutation(toolName, input) };
}

async function run(session: OdooSession, task: () => Promise<unknown>) {
  try {
    return { ok: true as const, result: await task() };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Odoo rechazó la consulta.",
    };
  }
}

export function createOdooTools(session: OdooSession) {
  return {
    odoo_models: tool({
      description:
        "Busca modelos instalados en ir.model por nombre técnico o etiqueta. Úsalo cuando no sepas el modelo exacto.",
      inputSchema: z.object({
        query: z.string().max(80).optional().describe("Texto a buscar en el nombre o la etiqueta del modelo."),
      }),
      execute: async ({ query }) => {
        const odooDomain = query
          ? ["|", ["model", "ilike", query], ["name", "ilike", query]]
          : [];
        const response = await run(session, () =>
          session.execute("ir.model", "search_read", [odooDomain], {
            fields: ["name", "model"],
            limit: 25,
            order: "model",
          }),
        );
        if (!response.ok) return response;
        return { ok: true, models: bound(response.result) };
      },
    }),
    odoo_fields: tool({
      description:
        "Lista campos de un modelo (nombre técnico, etiqueta, tipo y relación). Úsalo antes de filtrar por un campo dudoso.",
      inputSchema: z.object({
        model: modelName,
        query: z.string().max(80).optional().describe("Filtra campos cuyo nombre o etiqueta contenga este texto."),
      }),
      execute: async ({ model, query }) => {
        const response = await run(session, () =>
          session.execute(model, "fields_get", [], {
            attributes: ["string", "type", "relation"],
          }),
        );
        if (!response.ok) return response;
        const raw = response.result;
        const entries =
          raw && typeof raw === "object"
            ? Object.entries(raw as Record<string, { string?: string; type?: string; relation?: string }>)
            : [];
        const needle = query?.toLowerCase();
        const fields = entries
          .filter(([name, info]) => {
            if (!needle) return true;
            return name.toLowerCase().includes(needle) || (info.string ?? "").toLowerCase().includes(needle);
          })
          .slice(0, 40)
          .map(([name, info]) => ({
            name,
            label: info.string ?? name,
            type: info.type ?? "",
            relation: info.relation ?? "",
          }));
        return { ok: true, model, count: fields.length, fields };
      },
    }),
    odoo_search_count: tool({
      description: "Cuenta registros que cumplen un dominio, sin traer sus datos.",
      inputSchema: z.object({ model: modelName, domain }),
      execute: async ({ model, domain: recordDomain }) => {
        const response = await run(session, () =>
          session.execute(model, "search_count", [recordDomain ?? []], {}),
        );
        if (!response.ok) return response;
        return { ok: true, model, count: response.result };
      },
    }),
    odoo_search_read: tool({
      description:
        "Lee registros de un modelo. Si omites fields, solo devuelve id y display_name. Un dominio vacío queda limitado a 10 filas.",
      inputSchema: z.object({
        model: modelName,
        domain,
        fields,
        limit: z.number().int().min(1).max(80).optional(),
        offset: z.number().int().min(0).max(5000).optional(),
        order: z.string().max(80).optional().describe('Orden de Odoo, por ejemplo "date_order desc".'),
      }),
      execute: async ({ model, domain: recordDomain, fields: fieldNames, limit, offset, order }) => {
        const activeDomain = recordDomain ?? [];
        const activeLimit = activeDomain.length === 0 ? Math.min(limit ?? 10, 10) : (limit ?? 20);
        const response = await run(session, () =>
          session.execute(model, "search_read", [activeDomain], {
            fields: fieldNames && fieldNames.length > 0 ? fieldNames : ["id", "display_name"],
            limit: activeLimit,
            offset: offset ?? 0,
            ...(safeOrder(order) ? { order: safeOrder(order) } : {}),
          }),
        );
        if (!response.ok) return response;
        const records = Array.isArray(response.result) ? response.result : [];
        return {
          ok: true,
          model,
          count: records.length,
          limitedBecauseDomainWasEmpty: activeDomain.length === 0,
          records: bound(records),
        };
      },
    }),
    odoo_read: tool({
      description: "Lee registros concretos por id numérico.",
      inputSchema: z.object({
        model: modelName,
        ids: z.array(z.number().int().positive()).min(1).max(40),
        fields,
      }),
      execute: async ({ model, ids, fields: fieldNames }) => {
        const response = await run(session, () =>
          session.execute(model, "read", [ids], {
            fields: fieldNames && fieldNames.length > 0 ? fieldNames : ["id", "display_name"],
          }),
        );
        if (!response.ok) return response;
        const records = Array.isArray(response.result) ? response.result : [];
        return { ok: true, model, count: records.length, records: bound(records) };
      },
    }),
    odoo_create: tool({
      description:
        "Crea un registro. No ocurre hasta que la persona autorice el resumen. Úsalo solo cuando pidió crear algo.",
      inputSchema: z.object({
        model: modelName,
        values: recordValues.describe("Valores del registro nuevo. Un many2one va como id numérico."),
        resumen,
      }),
      execute: async ({ model, values }) => {
        const response = await run(session, () => session.execute(model, "create", [values], {}));
        if (!response.ok) return response;
        const id = typeof response.result === "number" ? response.result : null;
        return { ok: true, model, id, created: id !== null };
      },
    }),
    odoo_unlink: tool({
      description:
        "Borra registros por id. No ocurre hasta que la persona autorice el resumen. Confirma antes los ids con una lectura.",
      inputSchema: z.object({ model: modelName, ids, resumen }),
      execute: async ({ model, ids: recordIds }) => {
        const response = await run(session, () => session.execute(model, "unlink", [recordIds], {}));
        if (!response.ok) return response;
        return { ok: true, model, ids: recordIds, deleted: response.result === true };
      },
    }),
    odoo_publish: tool({
      description:
        "Publica registros. Si el modelo tiene is_published o website_published, lo marca publicado. Si no, llama a action_post (el botón Publicar de facturas y asientos). No ocurre hasta que la persona autorice el resumen.",
      inputSchema: z.object({ model: modelName, ids, resumen }),
      execute: async ({ model, ids: recordIds }) => {
        const fieldsResponse = await run(session, () =>
          session.execute(model, "fields_get", [], { attributes: ["type"] }),
        );
        if (!fieldsResponse.ok) return fieldsResponse;
        const names =
          fieldsResponse.result && typeof fieldsResponse.result === "object"
            ? Object.keys(fieldsResponse.result as Record<string, unknown>)
            : [];
        const field = names.includes("is_published")
          ? "is_published"
          : names.includes("website_published")
            ? "website_published"
            : null;
        if (field) {
          const response = await run(session, () =>
            session.execute(model, "write", [recordIds, { [field]: true }], {}),
          );
          if (!response.ok) return response;
          return { ok: true, model, ids: recordIds, publishedBy: field };
        }
        const response = await run(session, () => session.execute(model, "action_post", [recordIds], {}));
        if (!response.ok) return response;
        return { ok: true, model, ids: recordIds, publishedBy: "action_post" };
      },
    }),
  };
}
