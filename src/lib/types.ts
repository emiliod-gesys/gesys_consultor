export type EnvironmentName = "staging" | "production";

export type EnvironmentSummary = {
  baseUrl: string;
  databaseName: string;
  username: string;
  hasSecret: boolean;
};

export type ClientSummary = {
  id: string;
  name: string;
  notes: string;
  updatedAt: string;
  staging: EnvironmentSummary | null;
  production: EnvironmentSummary | null;
};

export type EnvironmentDraft = {
  baseUrl: string;
  databaseName: string;
  username: string;
  secret: string;
};

export type ClientDraft = {
  id?: string;
  name: string;
  notes: string;
  staging: EnvironmentDraft;
  production: EnvironmentDraft;
};

export type StoredEnvironment = {
  baseUrl: string;
  databaseName: string;
  username: string;
  secretCiphertext: string;
};

export type StoredClient = {
  id: string;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  staging: StoredEnvironment | null;
  production: StoredEnvironment | null;
};

export type OdooCredentials = {
  baseUrl: string;
  databaseName: string;
  username: string;
  secret: string;
};

export type ModelConfig = {
  id: string;
  effort: "low" | "medium" | "high" | "xhigh";
  ready: boolean;
};

export function isEnvironment(value: string): value is EnvironmentName {
  return value === "staging" || value === "production";
}

export function isClientId(value: string): boolean {
  return /^c_[a-z0-9]{8,40}$/.test(value);
}

export function createClientId(): string {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function environmentLabel(environment: EnvironmentName): string {
  return environment === "production" ? "Producción" : "Pruebas";
}
