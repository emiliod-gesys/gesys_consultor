"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createHash, timingSafeEqual } from "node:crypto";
import { endSession, requireUser, startSession } from "@/lib/auth";
import { removeClient, saveClientDraft, saveTranscript, testEnvironment } from "@/lib/client-service";
import type { ClientDraft, EnvironmentDraft, EnvironmentName } from "@/lib/types";
import { isClientId, isEnvironment } from "@/lib/types";

const failures = new Map<string, { count: number; reset: number }>();

function passwordsMatch(input: string, expected: string): boolean {
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

async function clientAddress(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function tooManyAttempts(key: string): boolean {
  const current = failures.get(key);
  return Boolean(current && current.reset > Date.now() && current.count >= 8);
}

function recordFailure(key: string): void {
  const now = Date.now();
  const current = failures.get(key);
  if (!current || current.reset < now) {
    failures.set(key, { count: 1, reset: now + 10 * 60 * 1000 });
    return;
  }
  current.count += 1;
}

function safeMessage(error: unknown): string {
  if (error instanceof Error && error.message && !error.message.includes("\n")) {
    return error.message.slice(0, 400);
  }
  return "No se pudo completar la operación.";
}

export async function login(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const expected = process.env.APP_PASSWORD ?? "";
  if (expected.length < 8) {
    return { ok: false, error: "El servidor no tiene APP_PASSWORD configurada (mínimo 8 caracteres)." };
  }
  const address = await clientAddress();
  if (tooManyAttempts(address)) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos." };
  }
  if (!passwordsMatch(password, expected)) {
    recordFailure(address);
    return { ok: false, error: "Contraseña incorrecta." };
  }
  failures.delete(address);
  await startSession();
  return { ok: true };
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function saveClient(
  draft: ClientDraft,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireUser();
  try {
    const id = await saveClientDraft(draft);
    revalidatePath("/");
    revalidatePath(`/clientes/${id}`);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function deleteClient(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  try {
    await removeClient(id);
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function testClientConnection(input: {
  clientId?: string;
  environment: EnvironmentName;
  draft: EnvironmentDraft;
}): Promise<{ ok: true; version: string; uid: number } | { ok: false; error: string }> {
  await requireUser();
  if (!isEnvironment(input.environment)) return { ok: false, error: "Entorno no válido." };
  try {
    const result = await testEnvironment(input);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function clearConversation(
  clientId: string,
  environment: EnvironmentName,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  if (!isClientId(clientId) || !isEnvironment(environment)) {
    return { ok: false, error: "No se pudo vaciar la conversación." };
  }
  try {
    await saveTranscript(clientId, environment, []);
    revalidatePath(`/clientes/${clientId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}
