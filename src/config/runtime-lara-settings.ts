import config from ".";
import { supabase } from "./supabase";
import type { RuntimeApiSettings } from "./runtime-api-settings";
import { LaraTranslateClient } from "../features/translate/lara-translate.client";

type LaraCredentials = { accessKeyId?: string; accessKeySecret?: string };
let cached: { credentials: LaraCredentials; expiresAt: number } | undefined;
let pending: Promise<LaraCredentials> | undefined;
let provider: { key: string; client: LaraTranslateClient } | undefined;

export async function getRuntimeLaraProvider(settings: RuntimeApiSettings): Promise<LaraTranslateClient | undefined> {
  let credentials: LaraCredentials;
  if (settings.laraCredentialMode === "disabled") return undefined;
  if (settings.laraCredentialMode === "environment") {
    credentials = { accessKeyId: config.laraAccessKeyId, accessKeySecret: config.laraAccessKeySecret };
  } else {
    credentials = await getManagedCredentials();
  }
  if (!credentials.accessKeyId || !credentials.accessKeySecret) return undefined;
  const key = `${credentials.accessKeyId}:${credentials.accessKeySecret}:${settings.laraTranslateTimeoutMs}`;
  if (!provider || provider.key !== key) {
    provider = {
      key,
      client: new LaraTranslateClient(
        credentials.accessKeyId,
        credentials.accessKeySecret,
        settings.laraTranslateTimeoutMs,
      ),
    };
  }
  return provider.client;
}

async function getManagedCredentials(): Promise<LaraCredentials> {
  if (cached && cached.expiresAt > Date.now()) return cached.credentials;
  if (pending) return pending;
  pending = loadManagedCredentials();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}

async function loadManagedCredentials(): Promise<LaraCredentials> {
  if (!supabase || !config.supabaseServiceRoleKey) return cached?.credentials ?? {};
  try {
    const result = await Promise.race([
      supabase.rpc("get_runtime_lara_credentials"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Lara credentials RPC timed out")), 2_000)),
    ]);
    if (result.error) throw result.error;
    const row = Array.isArray(result.data) ? result.data[0] : undefined;
    const credentials =
      row && typeof row.access_key_id === "string" && typeof row.access_key_secret === "string"
        ? { accessKeyId: row.access_key_id, accessKeySecret: row.access_key_secret }
        : {};
    cached = { credentials, expiresAt: Date.now() + 15_000 };
    return credentials;
  } catch {
    return cached?.credentials ?? {};
  }
}
