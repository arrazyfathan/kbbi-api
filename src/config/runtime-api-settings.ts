import config from ".";
import { supabase } from "./supabase";
import logger from "../lib/logger";

export type RuntimeApiSettings = {
  openaiTimeoutMs: number;
  aiRateLimitWindowMs: number;
  aiRateLimitMax: number;
};

const CACHE_MS = 15_000;
let cached: { settings: RuntimeApiSettings; expiresAt: number } | undefined;
let pending: Promise<RuntimeApiSettings> | undefined;

export async function getRuntimeApiSettings(): Promise<RuntimeApiSettings> {
  if (cached && cached.expiresAt > Date.now()) return cached.settings;
  if (pending) return pending;

  pending = loadSettings();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}

function environmentSettings(): RuntimeApiSettings {
  return {
    openaiTimeoutMs: config.upstream.openAiTimeoutMs,
    aiRateLimitWindowMs: config.rateLimit.ai.windowMs,
    aiRateLimitMax: config.rateLimit.ai.max,
  };
}

async function loadSettings(): Promise<RuntimeApiSettings> {
  if (!supabase || !config.supabaseServiceRoleKey) return environmentSettings();

  try {
    const { data, error } = await supabase.rpc("get_runtime_api_settings");
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : undefined;
    const settings = parseSettings(row);
    if (!settings) throw new Error("Runtime API settings are missing or invalid");
    cached = { settings, expiresAt: Date.now() + CACHE_MS };
    return settings;
  } catch (error) {
    logger.warn({ err: error }, "Unable to load runtime API settings; using cached or environment settings");
    return cached?.settings ?? environmentSettings();
  }
}

function parseSettings(value: unknown): RuntimeApiSettings | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const openaiTimeoutMs = Number(row.openai_timeout_ms);
  const aiRateLimitWindowMs = Number(row.ai_rate_limit_window_ms);
  const aiRateLimitMax = Number(row.ai_rate_limit_max);
  const values = [openaiTimeoutMs, aiRateLimitWindowMs, aiRateLimitMax];
  if (values.some((item) => !Number.isSafeInteger(item) || item < 1 || item > 2_147_483_647)) return undefined;
  return { openaiTimeoutMs, aiRateLimitWindowMs, aiRateLimitMax };
}
