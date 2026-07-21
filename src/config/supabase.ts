import { createClient } from "@supabase/supabase-js";
import config from ".";
import logger from "../lib/logger";

const supabaseConfig =
  config.isSupabaseConfigured && config.supabaseUrl && config.supabaseKey
    ? {
        url: config.supabaseUrl,
        key: config.supabaseKey,
      }
    : null;

if (!supabaseConfig) {
  logger.warn("Supabase env is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.");
}

export const supabase = supabaseConfig
  ? createClient(supabaseConfig.url, supabaseConfig.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export function getSupabaseHost(): string | null {
  if (!config.supabaseUrl) return null;

  try {
    return new URL(config.supabaseUrl).host;
  } catch {
    return null;
  }
}

export async function checkSupabaseConnection() {
  if (!supabaseConfig) {
    return {
      connected: false,
      host: getSupabaseHost(),
      error: "Missing SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY",
    };
  }

  const response = await fetch(`${supabaseConfig.url}/rest/v1/`, {
    method: "GET",
    headers: {
      apikey: supabaseConfig.key,
      Authorization: `Bearer ${supabaseConfig.key}`,
    },
  });

  return {
    connected: response.ok,
    host: getSupabaseHost(),
    status: response.status,
    statusText: response.statusText,
    error: response.ok ? undefined : await response.text(),
  };
}
