import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicUrl, isPrivateAddress } from "./ssrf.ts";

test("clasifica direcciones privadas", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.1.2.3"), true);
  assert.equal(isPrivateAddress("192.168.1.20"), true);
  assert.equal(isPrivateAddress("169.254.169.254"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("1.1.1.1"), false);
  assert.equal(isPrivateAddress("::1"), true);
});

test("rechaza esquemas, localhost y credenciales sin consultar la red", async () => {
  await assert.rejects(() => assertPublicUrl("file:///etc/passwd"), /http o https/);
  await assert.rejects(() => assertPublicUrl("http://localhost:8069"), /no está permitida/);
  await assert.rejects(() => assertPublicUrl("http://user:secret@example.com"), /usuario ni contraseña/);
  await assert.rejects(() => assertPublicUrl("http://127.0.0.1:8069"), /privadas/);
  await assert.rejects(() => assertPublicUrl("http://2130706433"), /privadas|IP decimal/);
});

test("acepta una IP pública literal", async () => {
  assert.equal(await assertPublicUrl("https://1.1.1.1/odoo/"), "https://1.1.1.1/odoo");
});
