import { createClient } from "@supabase/supabase-js";
import config from ".";
import logger from "../lib/logger";

const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseKey);
const supabaseUrl = config.supabaseUrl;
const supabaseKey = config.supabaseKey;

if (!config.supabaseUrl || !config.supabaseKey) {
  logger.warn("Supabase env is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.");
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseKey as string, {
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
  if (!isSupabaseConfigured) {
    return {
      connected: false,
      host: getSupabaseHost(),
      error: "Missing SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY",
    };
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/`, {
    method: "GET",
    headers: {
      apikey: supabaseKey as string,
      Authorization: `Bearer ${supabaseKey}`,
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
