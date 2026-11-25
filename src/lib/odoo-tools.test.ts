import { validateUIMessages, type UIMessage } from "ai";
import assert from "node:assert/strict";
import test from "node:test";
import { createOdooTools, describeMutation, mutationApproval } from "./odoo-tools.ts";

test("un mensaje de texto pasa la validación de herramientas", async () => {
  const tools = createOdooTools({
    version: "test",
    uid: 1,
    execute: async () => [],
  });
  const messages: UIMessage[] = [
    { id: "m1", role: "user", parts: [{ type: "text", text: "¿Cuántos pedidos hay?" }] },
  ];
  const validated = await validateUIMessages({ messages, tools });
  assert.equal(validated.length, 1);
  assert.equal(validated[0]?.role, "user");
});

test("crear, borrar y publicar describen el cambio y piden autorización", () => {
  const create = {
    model: "res.partner",
    values: { name: "Panavisión" },
    resumen: "Crear el contacto Panavisión.",
  };
  const description = describeMutation("odoo_create", create);
  assert.match(description, /res\.partner/);
  assert.match(description, /name="Panavisión"/);
  assert.equal(mutationApproval("odoo_search_read", create), undefined);
  assert.equal(mutationApproval("odoo_unlink", { model: "sale.order", ids: [4], resumen: "Borrar el pedido 4." })?.type, "user-approval");
});

test("crear llama a Odoo con el método create", async () => {
  const calls: string[] = [];
  const tools = createOdooTools({
    version: "test",
    uid: 1,
    execute: async (_model, method) => {
      calls.push(method);
      return 17;
    },
  });
  const result = await tools.odoo_create.execute!(
    { model: "res.partner", values: { name: "Panavisión" }, resumen: "Crear el contacto Panavisión." },
    { toolCallId: "call-1", messages: [], abortSignal: new AbortController().signal },
  );
  assert.deepEqual(calls, ["create"]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.id, 17);
});
