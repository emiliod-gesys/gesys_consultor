import { validateUIMessages, type UIMessage } from "ai";
import assert from "node:assert/strict";
import test from "node:test";
import { createOdooTools } from "./odoo-tools.ts";

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
