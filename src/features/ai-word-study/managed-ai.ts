import config, { AiProviderConfig } from "../../config";
import { getRuntimeApiSettings } from "../../config/runtime-api-settings";
import { supabase } from "../../config/supabase";
import logger from "../../lib/logger";
import { AiDefinitionProvider, OpenAiDefinitionProvider } from "../kbbi/ai-definition.service";
import { AiTranslationProvider, OpenAiTranslationClient } from "../translate/ai-translate.client";
import { AiWordStudyService } from "./ai-word-study.service";
import { createOpenAiCompatibleWordStudyProvider } from "./openai-word-study.provider";
import type { WordStudyProvider, WordStudyRequest } from "./ai-word-study.types";

type RuntimeProvider = AiProviderConfig & { isDefault: boolean; managed: boolean };
const CACHE_MS = 15_000;
let cached: { expires: number; providers: RuntimeProvider[] } | undefined;

export async function runtimeProviders(): Promise<RuntimeProvider[]> {
  if (cached && cached.expires > Date.now()) return cached.providers;
  if (!supabase || !config.supabaseServiceRoleKey) return envProviders();
  const { data, error } = await supabase.rpc("get_runtime_ai_providers");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return envProviders();
    logger.error({ err: error }, "Unable to load AI providers");
    throw new Error("Provider settings unavailable");
  }
  const providers = (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    apiKey: String(row.api_key),
    baseUrl: String(row.base_url),
    models: row.models as string[],
    defaultModel: String(row.default_model),
    isDefault: Boolean(row.is_default),
    managed: true,
  }));
  cached = { providers, expires: Date.now() + CACHE_MS };
  return providers;
}

function envProviders(): RuntimeProvider[] {
  return config.aiProviders.map((p) => ({ ...p, isDefault: p.id === config.defaultAiProvider, managed: false }));
}

async function consume(provider: RuntimeProvider): Promise<void> {
  if (!provider.managed || !supabase) return;
  const { data, error } = await supabase.rpc("consume_ai_budget", { p_provider_id: provider.id });
  if (error || !data) throw new Error("AI provider daily request budget reached or unavailable");
}

type TokenUsage = { input?: number; output?: number };
async function record(
  feature: string,
  provider: RuntimeProvider,
  model: string,
  outcome: string,
  durationMs: number,
  usage: TokenUsage,
): Promise<void> {
  if (!provider.managed || !supabase) return;
  try {
    const { error } = await supabase.from("ai_usage_events").insert({
      feature,
      provider_id: provider.id,
      model,
      outcome,
      duration_ms: durationMs,
      input_tokens: usage.input ?? null,
      output_tokens: usage.output ?? null,
    });
    if (error) logger.warn({ err: error }, "Unable to record AI usage");
  } catch (error) {
    logger.warn({ err: error }, "Unable to record AI usage");
  }
}

async function measured<T>(
  feature: string,
  provider: RuntimeProvider,
  model: string,
  usage: TokenUsage,
  call: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    await consume(provider);
    const result = await call();
    await record(feature, provider, model, "success", Date.now() - started, usage);
    return result;
  } catch (error) {
    await record(feature, provider, model, "error", Date.now() - started, usage);
    throw error;
  }
}

function defaultProvider(providers: RuntimeProvider[]): RuntimeProvider | undefined {
  return providers.find((p) => p.isDefault) ?? providers[0];
}

export class ManagedAiWordStudyService {
  async listProviders() {
    const providers = await runtimeProviders();
    return {
      defaultProvider: defaultProvider(providers)?.id ?? null,
      providers: providers.map((p) => ({ id: p.id, defaultModel: p.defaultModel, models: p.models })),
    };
  }

  async generate(request: WordStudyRequest, requestId?: string) {
    const [configs, runtimeSettings] = await Promise.all([runtimeProviders(), getRuntimeApiSettings()]);
    const providers: WordStudyProvider[] = configs.map((p) => {
      const usage: TokenUsage = {};
      const client = createOpenAiCompatibleWordStudyProvider(
        p.id,
        p.apiKey,
        p.models,
        p.defaultModel,
        runtimeSettings.openaiTimeoutMs,
        p.baseUrl,
        (input, output) => {
          usage.input = input;
          usage.output = output;
        },
      );
      return {
        name: client.name,
        models: client.models,
        defaultModel: client.defaultModel,
        generate: (input, model) => measured("word_study", p, model, usage, () => client.generate(input, model)),
      };
    });
    return new AiWordStudyService(providers, defaultProvider(configs)?.id).generate(request, requestId);
  }
}

export class ManagedDefinitionProvider implements AiDefinitionProvider {
  async generate(word: string): Promise<unknown> {
    const provider = defaultProvider(await runtimeProviders());
    if (!provider) throw new Error("No AI provider configured");
    const usage: TokenUsage = {};
    const runtimeSettings = await getRuntimeApiSettings();
    const client = new OpenAiDefinitionProvider(
      provider.apiKey,
      provider.defaultModel,
      runtimeSettings.openaiTimeoutMs,
      provider.baseUrl,
      (input, output) => {
        usage.input = input;
        usage.output = output;
      },
    );
    return measured("definition", provider, provider.defaultModel, usage, () => client.generate(word));
  }
}

export class ManagedTranslationProvider implements AiTranslationProvider {
  async translate(texts: string[], target: string): Promise<string[]> {
    const provider = defaultProvider(await runtimeProviders());
    if (!provider) throw new Error("No AI provider configured");
    const usage: TokenUsage = {};
    const runtimeSettings = await getRuntimeApiSettings();
    const client = new OpenAiTranslationClient(
      provider.apiKey,
      provider.defaultModel,
      runtimeSettings.openaiTimeoutMs,
      provider.baseUrl,
      (input, output) => {
        usage.input = input;
        usage.output = output;
      },
    );
    return measured("translation", provider, provider.defaultModel, usage, () => client.translate(texts, target));
  }
}
