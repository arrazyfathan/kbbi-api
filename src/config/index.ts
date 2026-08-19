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
const DEFAULT_TRANSLATE_CACHE_TTL_MS = 60 * 60 * 1000;

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
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
    TRANSLATE_CACHE_TTL_MS: positiveIntegerEnv("TRANSLATE_CACHE_TTL_MS", DEFAULT_TRANSLATE_CACHE_TTL_MS),
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

    if (env.NODE_ENV === "production" && !env.VISITOR_HASH_SALT) {
      ctx.addIssue({
        code: "custom",
        message: "VISITOR_HASH_SALT is required in production",
        path: ["VISITOR_HASH_SALT"],
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
  baseUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  supabaseKey?: string;
  isSupabaseConfigured: boolean;
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
  };
  cache: {
    wikiquoteTtlMs: number;
    translateTtlMs: number;
  };
  upstream: {
    kbbiFetchTimeoutMs: number;
    googleTranslateTimeoutMs: number;
  };
};

const config: Config = {
  port: parsedEnv.PORT,
  kbbiUrl: "https://kbbi.web.id",
  wikiquoteProverbUrl: "https://id.wikiquote.org/wiki/Peribahasa_Indonesia",
  wikiquoteIndonesianFigureUrl: "https://id.wikiquote.org/wiki/Kategori:Tokoh_Indonesia",
  googleTranslateUrl: parsedEnv.GOOGLE_TRANSLATE_URL,
  baseUrl: parsedEnv.BASE_URL,
  supabaseUrl: parsedEnv.SUPABASE_URL,
  supabaseAnonKey: parsedEnv.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: parsedEnv.SUPABASE_SERVICE_ROLE_KEY,
  supabaseKey,
  isSupabaseConfigured: Boolean(parsedEnv.SUPABASE_URL && supabaseKey),
  visitorHashSalt: parsedEnv.VISITOR_HASH_SALT,
  rateLimit: {
    global: {
      windowMs: parsedEnv.RATE_LIMIT_GLOBAL_WINDOW_MS,
      max: parsedEnv.RATE_LIMIT_GLOBAL_MAX,
    },
    scraper: {
      windowMs: parsedEnv.RATE_LIMIT_SCRAPER_WINDOW_MS,
      max: parsedEnv.RATE_LIMIT_SCRAPER_MAX,
    },
  },
  cache: {
    wikiquoteTtlMs: parsedEnv.WIKIQUOTE_CACHE_TTL_MS,
    translateTtlMs: parsedEnv.TRANSLATE_CACHE_TTL_MS,
  },
  upstream: {
    kbbiFetchTimeoutMs: parsedEnv.KBBI_FETCH_TIMEOUT_MS,
    googleTranslateTimeoutMs: parsedEnv.GOOGLE_TRANSLATE_TIMEOUT_MS,
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
