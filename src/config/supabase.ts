import { createClient } from "@supabase/supabase-js";
import config from ".";
import logger from "../lib/logger";

if (!config.supabaseUrl || !config.supabaseKey) {
  logger.warn("Supabase env is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.");
}

export const supabase = createClient(
  config.supabaseUrl || "",
  config.supabaseKey || "",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export function getSupabaseHost(): string | null {
  if (!config.supabaseUrl) return null;

  try {
    return new URL(config.supabaseUrl).host;
  } catch {
    return null;
  }
}

export async function checkSupabaseConnection() {
  if (!config.supabaseUrl || !config.supabaseKey) {
    return {
      connected: false,
      host: getSupabaseHost(),
      error: "Missing SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY",
    };
  }

  const response = await fetch(`${config.supabaseUrl}/rest/v1/`, {
    method: "GET",
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
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
