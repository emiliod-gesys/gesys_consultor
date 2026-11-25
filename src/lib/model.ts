import "server-only";
import type { ModelConfig } from "@/lib/types";

const LEVELS = ["low", "medium", "high", "xhigh"] as const;

const DEFAULT_MODEL = "gemini-4-hydrogen";

export function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "";
}

export function getModelConfig(): ModelConfig {
  const requested = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const id = /^gemini-[a-z0-9.-]+$/.test(requested) ? requested : DEFAULT_MODEL;
  const requestedLevel = process.env.GEMINI_THINKING_LEVEL?.trim() || "high";
  const effort = LEVELS.find((item) => item === requestedLevel) ?? "high";
  return {
    id,
    effort,
    ready: getGeminiApiKey().length > 0,
  };
}

export const MODEL_NOTE =
  "Gemini 4 Hydrogen lee la base con razonamiento alto y señala problemas solo cuando puede citar modelo, criterio y conteo.";
