import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export async function readSession(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function requireUser(): Promise<void> {
  if (!(await readSession())) redirect("/login");
}

export async function requireApiUser(): Promise<Response | null> {
  if (await readSession()) return null;
  return new Response("La sesión caducó. Vuelve a entrar.", {
    status: 401,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function startSession(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
