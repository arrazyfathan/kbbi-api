import { config as loadDotenv } from "dotenv";
import { z } from "zod";

if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
  loadDotenv();
}

const DEFAULT_PORT = 3000;
const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_GLOBAL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_GLOBAL_RATE_LIMIT_MAX = 300;
const DEFAULT_SCRAPER_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_SCRAPER_RATE_LIMIT_MAX = 30;
const DEFAULT_WIKIQUOTE_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_KBBI_FETCH_TIMEOUT_MS = 45_000;
const DEFAULT_GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single";
const DEFAULT_GOOGLE_TRANSLATE_TIMEOUT_MS = 10_000;
const DEFAULT_LARA_TRANSLATE_TIMEOUT_MS = 10_000;
const DEFAULT_TRANSLATE_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_OPENAI_TIMEOUT_MS = 30_000;
const DEFAULT_AI_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_AI_RATE_LIMIT_MAX = 10;

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);

const aiProviderSchema = z
  .strictObject({
    id: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    apiKey: z.string().trim().min(1),
    baseUrl: z.string().trim().url(),
    models: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
    defaultModel: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((provider, ctx) => {
    if (new Set(provider.models).size !== provider.models.length) {
      ctx.addIssue({ code: "custom", path: ["models"], message: "Models must be unique" });
    }
    if (provider.defaultModel && !provider.models.includes(provider.defaultModel)) {
      ctx.addIssue({ code: "custom", path: ["defaultModel"], message: "Default model must be listed in models" });
    }
  });

const aiProvidersEnv = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "AI_PROVIDERS must be valid JSON" });
        return z.NEVER;
      }
    })
    .pipe(z.array(aiProviderSchema).min(1).max(20))
    .optional(),
);

function positiveIntegerEnv(name: string, defaultValue: number) {
  return z.preprocess(
    (value) => {
      if (typeof value === "string" && value.trim() === "") {
        return undefined;
      }

      return value;
    },
    z.coerce.number().int().positive(`${name} must be a positive integer`).default(defaultValue),
  );
}

const envSchema = z
  .object({
    PORT: positiveIntegerEnv("PORT", DEFAULT_PORT),
    BASE_URL: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().url("BASE_URL must be a valid URL").default(DEFAULT_BASE_URL),
    ),
    RATE_LIMIT_GLOBAL_WINDOW_MS: positiveIntegerEnv("RATE_LIMIT_GLOBAL_WINDOW_MS", DEFAULT_GLOBAL_RATE_LIMIT_WINDOW_MS),
    RATE_LIMIT_GLOBAL_MAX: positiveIntegerEnv("RATE_LIMIT_GLOBAL_MAX", DEFAULT_GLOBAL_RATE_LIMIT_MAX),
    RATE_LIMIT_SCRAPER_WINDOW_MS: positiveIntegerEnv(
      "RATE_LIMIT_SCRAPER_WINDOW_MS",
      DEFAULT_SCRAPER_RATE_LIMIT_WINDOW_MS,
    ),
    RATE_LIMIT_SCRAPER_MAX: positiveIntegerEnv("RATE_LIMIT_SCRAPER_MAX", DEFAULT_SCRAPER_RATE_LIMIT_MAX),
    WIKIQUOTE_CACHE_TTL_MS: positiveIntegerEnv("WIKIQUOTE_CACHE_TTL_MS", DEFAULT_WIKIQUOTE_CACHE_TTL_MS),
    KBBI_FETCH_TIMEOUT_MS: positiveIntegerEnv("KBBI_FETCH_TIMEOUT_MS", DEFAULT_KBBI_FETCH_TIMEOUT_MS),
    GOOGLE_TRANSLATE_URL: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().url("GOOGLE_TRANSLATE_URL must be a valid URL").default(DEFAULT_GOOGLE_TRANSLATE_URL),
    ),
    GOOGLE_TRANSLATE_TIMEOUT_MS: positiveIntegerEnv("GOOGLE_TRANSLATE_TIMEOUT_MS", DEFAULT_GOOGLE_TRANSLATE_TIMEOUT_MS),
    LARA_ACCESS_KEY_ID: optionalTrimmedString,
    LARA_ACCESS_KEY_SECRET: optionalTrimmedString,
    LARA_TRANSLATE_TIMEOUT_MS: positiveIntegerEnv("LARA_TRANSLATE_TIMEOUT_MS", DEFAULT_LARA_TRANSLATE_TIMEOUT_MS),
    TRANSLATE_CACHE_TTL_MS: positiveIntegerEnv("TRANSLATE_CACHE_TTL_MS", DEFAULT_TRANSLATE_CACHE_TTL_MS),
    OPENAI_API_KEY: optionalTrimmedString,
    OPENAI_MODEL: optionalTrimmedString,
    OPENAI_BASE_URL: optionalTrimmedString.pipe(z.url("OPENAI_BASE_URL must be a valid URL").optional()),
    OPENAI_TIMEOUT_MS: positiveIntegerEnv("OPENAI_TIMEOUT_MS", DEFAULT_OPENAI_TIMEOUT_MS),
    AI_PROVIDERS: aiProvidersEnv,
    AI_DEFAULT_PROVIDER: optionalTrimmedString,
    AI_RATE_LIMIT_WINDOW_MS: positiveIntegerEnv("AI_RATE_LIMIT_WINDOW_MS", DEFAULT_AI_RATE_LIMIT_WINDOW_MS),
    AI_RATE_LIMIT_MAX: positiveIntegerEnv("AI_RATE_LIMIT_MAX", DEFAULT_AI_RATE_LIMIT_MAX),
    NODE_ENV: optionalTrimmedString,
    SUPABASE_URL: optionalTrimmedString.pipe(z.url("SUPABASE_URL must be a valid URL").optional()),
    SUPABASE_ANON_KEY: optionalTrimmedString,
    SUPABASE_SERVICE_ROLE_KEY: optionalTrimmedString,
    VISITOR_HASH_SALT: optionalTrimmedString,
  })
  .superRefine((env, ctx) => {
    const hasSupabaseUrl = Boolean(env.SUPABASE_URL);
    const hasSupabaseKey = Boolean(env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY);

    if (hasSupabaseUrl !== hasSupabaseKey) {
      ctx.addIssue({
        code: "custom",
        message: "Supabase config must include SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY",
        path: hasSupabaseUrl ? ["SUPABASE_ANON_KEY"] : ["SUPABASE_URL"],
      });
    }

    const hasLaraAccessKeyId = Boolean(env.LARA_ACCESS_KEY_ID);
    const hasLaraAccessKeySecret = Boolean(env.LARA_ACCESS_KEY_SECRET);

    if (hasLaraAccessKeyId !== hasLaraAccessKeySecret) {
      ctx.addIssue({
        code: "custom",
        message: "Lara config must include both LARA_ACCESS_KEY_ID and LARA_ACCESS_KEY_SECRET",
        path: hasLaraAccessKeyId ? ["LARA_ACCESS_KEY_SECRET"] : ["LARA_ACCESS_KEY_ID"],
      });
    }

    if (env.NODE_ENV === "production" && !env.VISITOR_HASH_SALT) {
      ctx.addIssue({
        code: "custom",
        message: "VISITOR_HASH_SALT is required in production",
        path: ["VISITOR_HASH_SALT"],
      });
    }
    if (Boolean(env.OPENAI_API_KEY) !== Boolean(env.OPENAI_MODEL)) {
      ctx.addIssue({
        code: "custom",
        message: "OpenAI config must include both OPENAI_API_KEY and OPENAI_MODEL",
        path: env.OPENAI_API_KEY ? ["OPENAI_MODEL"] : ["OPENAI_API_KEY"],
      });
    }

    const providerIds = [
      ...(env.OPENAI_API_KEY && env.OPENAI_MODEL ? ["openai"] : []),
      ...(env.AI_PROVIDERS?.map((provider) => provider.id) ?? []),
    ];
    if (new Set(providerIds).size !== providerIds.length) {
      ctx.addIssue({ code: "custom", path: ["AI_PROVIDERS"], message: "Provider IDs must be unique" });
    }
    if (env.AI_DEFAULT_PROVIDER && !providerIds.includes(env.AI_DEFAULT_PROVIDER)) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_DEFAULT_PROVIDER"],
        message: "AI_DEFAULT_PROVIDER must identify a configured provider",
      });
    }
  });

const parsedEnv = parseEnv(process.env);
const supabaseKey = parsedEnv.SUPABASE_SERVICE_ROLE_KEY || parsedEnv.SUPABASE_ANON_KEY;

export type Config = {
  port: number;
  kbbiUrl: string;
  wikiquoteProverbUrl: string;
  wikiquoteIndonesianFigureUrl: string;
  googleTranslateUrl: string;
  laraAccessKeyId?: string;
  laraAccessKeySecret?: string;
  isLaraConfigured: boolean;
  baseUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  supabaseKey?: string;
  isSupabaseConfigured: boolean;
  openAiApiKey?: string;
  openAiModel?: string;
  openAiBaseUrl?: string;
  isOpenAiConfigured: boolean;
  aiProviders: AiProviderConfig[];
  defaultAiProvider?: string;
  visitorHashSalt?: string;
  rateLimit: {
    global: {
      windowMs: number;
      max: number;
    };
    scraper: {
      windowMs: number;
      max: number;
    };
    ai: {
      windowMs: number;
      max: number;
    };
  };
  cache: {
    wikiquoteTtlMs: number;
    translateTtlMs: number;
  };
  upstream: {
    kbbiFetchTimeoutMs: number;
    googleTranslateTimeoutMs: number;
    laraTranslateTimeoutMs: number;
    openAiTimeoutMs: number;
  };
};

export type AiProviderConfig = {
  id: string;
  apiKey: string;
  baseUrl?: string;
  models: string[];
  defaultModel: string;
};

const aiProviders: AiProviderConfig[] = [
  ...(parsedEnv.OPENAI_API_KEY && parsedEnv.OPENAI_MODEL
    ? [
        {
          id: "openai",
          apiKey: parsedEnv.OPENAI_API_KEY,
          baseUrl: parsedEnv.OPENAI_BASE_URL,
          models: [parsedEnv.OPENAI_MODEL],
          defaultModel: parsedEnv.OPENAI_MODEL,
        },
      ]
    : []),
  ...(parsedEnv.AI_PROVIDERS?.map((provider) => ({
    ...provider,
    defaultModel: provider.defaultModel ?? provider.models[0],
  })) ?? []),
];

const config: Config = {
  port: parsedEnv.PORT,
  kbbiUrl: "https://kbbi.web.id",
  wikiquoteProverbUrl: "https://id.wikiquote.org/wiki/Peribahasa_Indonesia",
  wikiquoteIndonesianFigureUrl: "https://id.wikiquote.org/wiki/Kategori:Tokoh_Indonesia",
  googleTranslateUrl: parsedEnv.GOOGLE_TRANSLATE_URL,
  laraAccessKeyId: parsedEnv.LARA_ACCESS_KEY_ID,
  laraAccessKeySecret: parsedEnv.LARA_ACCESS_KEY_SECRET,
  isLaraConfigured: Boolean(parsedEnv.LARA_ACCESS_KEY_ID && parsedEnv.LARA_ACCESS_KEY_SECRET),
  baseUrl: parsedEnv.BASE_URL,
  supabaseUrl: parsedEnv.SUPABASE_URL,
  supabaseAnonKey: parsedEnv.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: parsedEnv.SUPABASE_SERVICE_ROLE_KEY,
  supabaseKey,
  isSupabaseConfigured: Boolean(parsedEnv.SUPABASE_URL && supabaseKey),
  visitorHashSalt: parsedEnv.VISITOR_HASH_SALT,
  openAiApiKey: parsedEnv.OPENAI_API_KEY,
  openAiModel: parsedEnv.OPENAI_MODEL,
  openAiBaseUrl: parsedEnv.OPENAI_BASE_URL,
  isOpenAiConfigured: Boolean(parsedEnv.OPENAI_API_KEY && parsedEnv.OPENAI_MODEL),
  aiProviders,
  defaultAiProvider: parsedEnv.AI_DEFAULT_PROVIDER ?? aiProviders[0]?.id,
  rateLimit: {
    global: {
      windowMs: parsedEnv.RATE_LIMIT_GLOBAL_WINDOW_MS,
      max: parsedEnv.RATE_LIMIT_GLOBAL_MAX,
    },
    scraper: {
      windowMs: parsedEnv.RATE_LIMIT_SCRAPER_WINDOW_MS,
      max: parsedEnv.RATE_LIMIT_SCRAPER_MAX,
    },
    ai: {
      windowMs: parsedEnv.AI_RATE_LIMIT_WINDOW_MS,
      max: parsedEnv.AI_RATE_LIMIT_MAX,
    },
  },
  cache: {
    wikiquoteTtlMs: parsedEnv.WIKIQUOTE_CACHE_TTL_MS,
    translateTtlMs: parsedEnv.TRANSLATE_CACHE_TTL_MS,
  },
  upstream: {
    kbbiFetchTimeoutMs: parsedEnv.KBBI_FETCH_TIMEOUT_MS,
    googleTranslateTimeoutMs: parsedEnv.GOOGLE_TRANSLATE_TIMEOUT_MS,
    laraTranslateTimeoutMs: parsedEnv.LARA_TRANSLATE_TIMEOUT_MS,
    openAiTimeoutMs: parsedEnv.OPENAI_TIMEOUT_MS,
  },
};

export function parseEnv(env: NodeJS.ProcessEnv) {
  const result = envSchema.safeParse(env);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues.map((issue) => {
    const variableName = issue.path.join(".") || "environment";

    return `${variableName}: ${issue.message}`;
  });

  throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
}

export default config;
