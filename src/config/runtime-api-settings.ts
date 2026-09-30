import config from ".";
import { supabase } from "./supabase";
import logger from "../lib/logger";

export type RuntimeApiSettings = {
  openaiTimeoutMs: number;
  aiRateLimitWindowMs: number;
  aiRateLimitMax: number;
  globalRateLimitWindowMs: number;
  globalRateLimitMax: number;
  scraperRateLimitWindowMs: number;
  scraperRateLimitMax: number;
  wikiquoteCacheTtlMs: number;
  kbbiFetchTimeoutMs: number;
  googleTranslateTimeoutMs: number;
  translateCacheTtlMs: number;
  laraTranslateTimeoutMs: number;
  laraCredentialMode: "environment" | "managed" | "disabled";
};

const CACHE_MS = 15_000;
const RETRY_MS = 15_000;
const RPC_TIMEOUT_MS = 2_000;
let cached: { settings: RuntimeApiSettings; expiresAt: number } | undefined;
let pending: Promise<RuntimeApiSettings> | undefined;
let retryAt = 0;

export async function getRuntimeApiSettings(): Promise<RuntimeApiSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.settings;
  if (Date.now() < retryAt) return cached?.settings ?? environmentSettings();
  if (pending) return cached?.settings ?? pending;

  pending = loadSettings();
  if (cached) {
    void pending
      .finally(() => {
        pending = undefined;
      })
      .catch(() => undefined);
    return cached.settings;
  }
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}

function environmentSettings(): RuntimeApiSettings {
  return {
    openaiTimeoutMs: config.upstream?.openAiTimeoutMs ?? 30_000,
    aiRateLimitWindowMs: config.rateLimit?.ai?.windowMs ?? 900_000,
    aiRateLimitMax: config.rateLimit?.ai?.max ?? 10,
    globalRateLimitWindowMs: config.rateLimit?.global?.windowMs ?? 900_000,
    globalRateLimitMax: config.rateLimit?.global?.max ?? 300,
    scraperRateLimitWindowMs: config.rateLimit?.scraper?.windowMs ?? 900_000,
    scraperRateLimitMax: config.rateLimit?.scraper?.max ?? 30,
    wikiquoteCacheTtlMs: config.cache?.wikiquoteTtlMs ?? 3_600_000,
    kbbiFetchTimeoutMs: config.upstream?.kbbiFetchTimeoutMs ?? 45_000,
    googleTranslateTimeoutMs: config.upstream?.googleTranslateTimeoutMs ?? 10_000,
    translateCacheTtlMs: config.cache?.translateTtlMs ?? 3_600_000,
    laraTranslateTimeoutMs: config.upstream?.laraTranslateTimeoutMs ?? 10_000,
    laraCredentialMode: "environment",
  };
}

async function loadSettings(): Promise<RuntimeApiSettings> {
  if (!supabase || !config.supabaseServiceRoleKey) return environmentSettings();

  try {
    const { data, error } = await Promise.race([
      supabase.rpc("get_runtime_api_settings"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Runtime settings RPC timed out")), RPC_TIMEOUT_MS),
      ),
    ]);
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : undefined;
    const settings = parseSettings(row);
    if (!settings) throw new Error("Runtime API settings are missing or invalid");
    cached = { settings, expiresAt: Date.now() + CACHE_MS };
    retryAt = 0;
    return settings;
  } catch (error) {
    logger.warn({ err: error }, "Unable to load runtime API settings; using cached or environment settings");
    retryAt = Date.now() + RETRY_MS;
    return cached?.settings ?? environmentSettings();
  }
}

function parseSettings(value: unknown): RuntimeApiSettings | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const openaiTimeoutMs = Number(row.openai_timeout_ms);
  const aiRateLimitWindowMs = Number(row.ai_rate_limit_window_ms);
  const aiRateLimitMax = Number(row.ai_rate_limit_max);
  const globalRateLimitWindowMs = Number(row.global_rate_limit_window_ms);
  const globalRateLimitMax = Number(row.global_rate_limit_max);
  const scraperRateLimitWindowMs = Number(row.scraper_rate_limit_window_ms);
  const scraperRateLimitMax = Number(row.scraper_rate_limit_max);
  const wikiquoteCacheTtlMs = Number(row.wikiquote_cache_ttl_ms);
  const kbbiFetchTimeoutMs = Number(row.kbbi_fetch_timeout_ms);
  const googleTranslateTimeoutMs = Number(row.google_translate_timeout_ms);
  const translateCacheTtlMs = Number(row.translate_cache_ttl_ms);
  const laraTranslateTimeoutMs = Number(row.lara_translate_timeout_ms);
  const laraCredentialMode = row.lara_credential_mode;
  const values = [
    openaiTimeoutMs,
    aiRateLimitWindowMs,
    aiRateLimitMax,
    globalRateLimitWindowMs,
    globalRateLimitMax,
    scraperRateLimitWindowMs,
    scraperRateLimitMax,
    wikiquoteCacheTtlMs,
    kbbiFetchTimeoutMs,
    googleTranslateTimeoutMs,
    translateCacheTtlMs,
    laraTranslateTimeoutMs,
  ];
  if (values.some((item) => !Number.isSafeInteger(item) || item < 1 || item > 2_147_483_647)) return undefined;
  if (laraCredentialMode !== "environment" && laraCredentialMode !== "managed" && laraCredentialMode !== "disabled")
    return undefined;
  return {
    openaiTimeoutMs,
    aiRateLimitWindowMs,
    aiRateLimitMax,
    globalRateLimitWindowMs,
    globalRateLimitMax,
    scraperRateLimitWindowMs,
    scraperRateLimitMax,
    wikiquoteCacheTtlMs,
    kbbiFetchTimeoutMs,
    googleTranslateTimeoutMs,
    translateCacheTtlMs,
    laraTranslateTimeoutMs,
    laraCredentialMode,
  };
}
