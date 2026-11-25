import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(): Buffer {
  const secret = process.env.CREDENTIALS_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("Falta CREDENTIALS_SECRET (mínimo 16 caracteres) para cifrar las claves de Odoo.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  try {
    if (!payload.startsWith("v1.")) throw new Error("formato");
    const buffer = Buffer.from(payload.slice(3), "base64url");
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const ciphertext = buffer.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message.includes("CREDENTIALS_SECRET")) throw error;
    throw new Error(
      "No se pudo leer la clave guardada. Escríbela de nuevo: la clave de cifrado del servidor puede haber cambiado.",
    );
  }
}
