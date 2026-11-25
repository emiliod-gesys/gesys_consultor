export const SESSION_COOKIE = "gesys_session";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function sessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.APP_PASSWORD || "";
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sign(payload: string): Promise<string> {
  const secret = sessionSecret();
  if (secret.length < 8) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return encodeBase64Url(new Uint8Array(signature));
}

function signaturesMatch(left: string, right: string): boolean {
  if (left.length === 0 || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function createSessionToken(): Promise<string> {
  if (sessionSecret().length < 8) {
    throw new Error("Falta SESSION_SECRET o APP_PASSWORD para firmar la sesión.");
  }
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${expires}`;
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < Date.now() / 1000) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  return signaturesMatch(await sign(payload), parts[2] ?? "");
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
