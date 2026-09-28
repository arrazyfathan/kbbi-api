import config from "../config";
import { supabase } from "../config/supabase";

async function main() {
  if (!supabase || !config.supabaseServiceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  const { count, error: countError } = await supabase.from("ai_providers").select("id", { head: true, count: "exact" });
  if (countError) throw countError;
  if (count) throw new Error("Provider table is not empty; import skipped to protect admin changes");
  for (const provider of config.aiProviders) {
    const { error } = await supabase.rpc("admin_save_ai_provider", {
      p_id: provider.id,
      p_base_url: provider.baseUrl ?? "https://api.openai.com/v1",
      p_models: provider.models,
      p_default_model: provider.defaultModel,
      p_api_key: provider.apiKey,
      p_enabled: true,
      p_is_default: provider.id === config.defaultAiProvider,
      p_daily_request_limit: null,
      p_input_price_per_million: null,
      p_output_price_per_million: null,
      p_actor_id: null,
    });
    if (error) throw error;
    process.stdout.write(`Imported provider ${provider.id}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
