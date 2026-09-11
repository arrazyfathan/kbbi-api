import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CONFIG_ENV_KEYS = [
  "PORT",
  "BASE_URL",
  "RATE_LIMIT_GLOBAL_WINDOW_MS",
  "RATE_LIMIT_GLOBAL_MAX",
  "RATE_LIMIT_SCRAPER_WINDOW_MS",
  "RATE_LIMIT_SCRAPER_MAX",
  "WIKIQUOTE_CACHE_TTL_MS",
  "KBBI_FETCH_TIMEOUT_MS",
  "GOOGLE_TRANSLATE_URL",
  "GOOGLE_TRANSLATE_TIMEOUT_MS",
  "LARA_ACCESS_KEY_ID",
  "LARA_ACCESS_KEY_SECRET",
  "LARA_TRANSLATE_TIMEOUT_MS",
  "TRANSLATE_CACHE_TTL_MS",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL",
  "OPENAI_TIMEOUT_MS",
  "AI_PROVIDERS",
  "AI_DEFAULT_PROVIDER",
  "AI_RATE_LIMIT_WINDOW_MS",
  "AI_RATE_LIMIT_MAX",
  "NODE_ENV",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VISITOR_HASH_SALT",
] as const;

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();

    for (const key of CONFIG_ENV_KEYS) {
      vi.stubEnv(key, "");
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exports defaults when optional env vars are missing", async () => {
    const { default: config } = await import("../src/config");

    expect(config.port).toBe(3000);
    expect(config.baseUrl).toBe("http://localhost:3000");
    expect(config.kbbiUrl).toBe("https://kbbi.web.id");
    expect(config.isSupabaseConfigured).toBe(false);
    expect(config.isLaraConfigured).toBe(false);
    expect(config.isOpenAiConfigured).toBe(false);
    expect(config.aiProviders).toEqual([]);
    expect(config.defaultAiProvider).toBeUndefined();
    expect(config.openAiBaseUrl).toBeUndefined();
    expect(config.laraAccessKeyId).toBeUndefined();
    expect(config.laraAccessKeySecret).toBeUndefined();
    expect(config.supabaseUrl).toBeUndefined();
    expect(config.supabaseKey).toBeUndefined();
    expect(config.rateLimit).toEqual({
      global: {
        windowMs: 900000,
        max: 300,
      },
      scraper: {
        windowMs: 900000,
        max: 30,
      },
      ai: {
        windowMs: 900000,
        max: 10,
      },
    });
    expect(config.cache).toEqual({
      wikiquoteTtlMs: 3600000,
      translateTtlMs: 3600000,
    });
    expect(config.upstream).toEqual({
      kbbiFetchTimeoutMs: 45000,
      googleTranslateTimeoutMs: 10000,
      laraTranslateTimeoutMs: 10000,
      openAiTimeoutMs: 30000,
    });
    expect(config.googleTranslateUrl).toBe("https://translate.googleapis.com/translate_a/single");
  });

  it("parses valid env values and prefers the service role key", async () => {
    vi.stubEnv("PORT", "8080");
    vi.stubEnv("BASE_URL", "https://api.example.com");
    vi.stubEnv("RATE_LIMIT_GLOBAL_WINDOW_MS", "60000");
    vi.stubEnv("RATE_LIMIT_GLOBAL_MAX", "100");
    vi.stubEnv("RATE_LIMIT_SCRAPER_WINDOW_MS", "30000");
    vi.stubEnv("RATE_LIMIT_SCRAPER_MAX", "10");
    vi.stubEnv("WIKIQUOTE_CACHE_TTL_MS", "120000");
    vi.stubEnv("KBBI_FETCH_TIMEOUT_MS", "45000");
    vi.stubEnv("GOOGLE_TRANSLATE_URL", "https://translate.googleapis.com/translate_a/single");
    vi.stubEnv("GOOGLE_TRANSLATE_TIMEOUT_MS", "15000");
    vi.stubEnv("LARA_ACCESS_KEY_ID", "lara-key-id");
    vi.stubEnv("LARA_ACCESS_KEY_SECRET", "lara-key-secret");
    vi.stubEnv("LARA_TRANSLATE_TIMEOUT_MS", "12000");
    vi.stubEnv("TRANSLATE_CACHE_TTL_MS", "60000");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("OPENAI_MODEL", "configured-model");
    vi.stubEnv("OPENAI_BASE_URL", "https://compatible.example.com/v1");
    vi.stubEnv("OPENAI_TIMEOUT_MS", "20000");
    vi.stubEnv("AI_RATE_LIMIT_WINDOW_MS", "120000");
    vi.stubEnv("AI_RATE_LIMIT_MAX", "5");
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("VISITOR_HASH_SALT", "salt-value");

    const { default: config } = await import("../src/config");

    expect(config.port).toBe(8080);
    expect(config.baseUrl).toBe("https://api.example.com");
    expect(config.supabaseUrl).toBe("https://project.supabase.co");
    expect(config.supabaseAnonKey).toBe("anon-key");
    expect(config.supabaseServiceRoleKey).toBe("service-role-key");
    expect(config.supabaseKey).toBe("service-role-key");
    expect(config.isSupabaseConfigured).toBe(true);
    expect(config.isLaraConfigured).toBe(true);
    expect(config.laraAccessKeyId).toBe("lara-key-id");
    expect(config.laraAccessKeySecret).toBe("lara-key-secret");
    expect(config.visitorHashSalt).toBe("salt-value");
    expect(config.isOpenAiConfigured).toBe(true);
    expect(config.openAiApiKey).toBe("openai-key");
    expect(config.openAiModel).toBe("configured-model");
    expect(config.openAiBaseUrl).toBe("https://compatible.example.com/v1");
    expect(config.aiProviders).toEqual([
      {
        id: "openai",
        apiKey: "openai-key",
        baseUrl: "https://compatible.example.com/v1",
        models: ["configured-model"],
        defaultModel: "configured-model",
      },
    ]);
    expect(config.defaultAiProvider).toBe("openai");
    expect(config.rateLimit).toEqual({
      global: {
        windowMs: 60000,
        max: 100,
      },
      scraper: {
        windowMs: 30000,
        max: 10,
      },
      ai: {
        windowMs: 120000,
        max: 5,
      },
    });
    expect(config.cache).toEqual({
      wikiquoteTtlMs: 120000,
      translateTtlMs: 60000,
    });
    expect(config.upstream).toEqual({
      kbbiFetchTimeoutMs: 45000,
      googleTranslateTimeoutMs: 15000,
      laraTranslateTimeoutMs: 12000,
      openAiTimeoutMs: 20000,
    });
    expect(config.googleTranslateUrl).toBe("https://translate.googleapis.com/translate_a/single");
  });

  it("allows fully missing Supabase config", async () => {
    const { parseEnv } = await import("../src/config");

    const env = parseEnv({});

    expect(env).not.toHaveProperty("SUPABASE_URL");
    expect(env).not.toHaveProperty("SUPABASE_ANON_KEY");
    expect(env).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("allows missing visitor hash salt outside production", async () => {
    const { parseEnv } = await import("../src/config");

    expect(parseEnv({ NODE_ENV: "development" }).VISITOR_HASH_SALT).toBeUndefined();
    expect(parseEnv({ NODE_ENV: "test", VISITOR_HASH_SALT: "   " }).VISITOR_HASH_SALT).toBeUndefined();
  });

  it("requires visitor hash salt in production", async () => {
    const { parseEnv } = await import("../src/config");

    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/VISITOR_HASH_SALT/);
    expect(() => parseEnv({ NODE_ENV: "production", VISITOR_HASH_SALT: "   " })).toThrow(/VISITOR_HASH_SALT/);
    expect(parseEnv({ NODE_ENV: "production", VISITOR_HASH_SALT: "production-salt" }).VISITOR_HASH_SALT).toBe(
      "production-salt",
    );
  });

  it("rejects invalid URL values with clear variable names", async () => {
    const { parseEnv } = await import("../src/config");

    expect(() => parseEnv({ BASE_URL: "not-a-url" })).toThrow(/BASE_URL/);
    expect(() =>
      parseEnv({
        SUPABASE_URL: "not-a-url",
        SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toThrow(/SUPABASE_URL/);
  });

  it("rejects invalid port values with a clear variable name", async () => {
    const { parseEnv } = await import("../src/config");

    expect(() => parseEnv({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => parseEnv({ PORT: "0" })).toThrow(/PORT/);
  });

  it("rejects invalid cache TTL values with a clear variable name", async () => {
    const { parseEnv } = await import("../src/config");

    expect(() => parseEnv({ WIKIQUOTE_CACHE_TTL_MS: "abc" })).toThrow(/WIKIQUOTE_CACHE_TTL_MS/);
    expect(() => parseEnv({ WIKIQUOTE_CACHE_TTL_MS: "0" })).toThrow(/WIKIQUOTE_CACHE_TTL_MS/);
    expect(() => parseEnv({ WIKIQUOTE_CACHE_TTL_MS: "-1" })).toThrow(/WIKIQUOTE_CACHE_TTL_MS/);
  });

  it("rejects invalid KBBI timeout values with a clear variable name", async () => {
    const { parseEnv } = await import("../src/config");

    expect(() => parseEnv({ KBBI_FETCH_TIMEOUT_MS: "abc" })).toThrow(/KBBI_FETCH_TIMEOUT_MS/);
    expect(() => parseEnv({ KBBI_FETCH_TIMEOUT_MS: "0" })).toThrow(/KBBI_FETCH_TIMEOUT_MS/);
    expect(() => parseEnv({ KBBI_FETCH_TIMEOUT_MS: "-1" })).toThrow(/KBBI_FETCH_TIMEOUT_MS/);
  });

  it("rejects partial Supabase config", async () => {
    const { parseEnv } = await import("../src/config");

    expect(() => parseEnv({ SUPABASE_URL: "https://project.supabase.co" })).toThrow(/Supabase config/);
    expect(() => parseEnv({ SUPABASE_ANON_KEY: "anon-key" })).toThrow(/Supabase config/);
  });

  it("rejects partial Lara config", async () => {
    const { parseEnv } = await import("../src/config");

    expect(() => parseEnv({ LARA_ACCESS_KEY_ID: "lara-key-id" })).toThrow(/Lara config/);
    expect(() => parseEnv({ LARA_ACCESS_KEY_SECRET: "lara-key-secret" })).toThrow(/Lara config/);
  });

  it("rejects partial OpenAI config and invalid AI limits", async () => {
    const { parseEnv } = await import("../src/config");

    expect(() => parseEnv({ OPENAI_API_KEY: "key" })).toThrow(/OpenAI config/);
    expect(() => parseEnv({ OPENAI_MODEL: "model" })).toThrow(/OpenAI config/);
    expect(() => parseEnv({ OPENAI_TIMEOUT_MS: "0" })).toThrow(/OPENAI_TIMEOUT_MS/);
    expect(() => parseEnv({ AI_RATE_LIMIT_MAX: "nope" })).toThrow(/AI_RATE_LIMIT_MAX/);
    expect(() => parseEnv({ OPENAI_BASE_URL: "not-a-url" })).toThrow(/OPENAI_BASE_URL/);
  });

  it("parses multiple OpenAI-compatible providers and validates their allowlists", async () => {
    vi.stubEnv(
      "AI_PROVIDERS",
      JSON.stringify([
        {
          id: "OpenRouter",
          apiKey: "router-key",
          baseUrl: "https://openrouter.ai/api/v1",
          models: ["vendor/fast", "vendor/smart"],
          defaultModel: "vendor/smart",
        },
      ]),
    );
    vi.stubEnv("AI_DEFAULT_PROVIDER", "OpenRouter");

    const { default: config, parseEnv } = await import("../src/config");
    expect(config.defaultAiProvider).toBe("OpenRouter");
    expect(config.aiProviders[0]).toMatchObject({ id: "OpenRouter", defaultModel: "vendor/smart" });
    expect(() => parseEnv({ AI_PROVIDERS: "not-json" })).toThrow(/AI_PROVIDERS/);
    expect(() =>
      parseEnv({
        AI_PROVIDERS: JSON.stringify([
          { id: "provider", apiKey: "key", baseUrl: "https://example.com/v1", models: ["one"] },
        ]),
        AI_DEFAULT_PROVIDER: "missing",
      }),
    ).toThrow(/AI_DEFAULT_PROVIDER/);
  });
});
