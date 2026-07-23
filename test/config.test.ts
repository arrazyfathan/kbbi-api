import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CONFIG_ENV_KEYS = [
  "PORT",
  "BASE_URL",
  "RATE_LIMIT_GLOBAL_WINDOW_MS",
  "RATE_LIMIT_GLOBAL_MAX",
  "RATE_LIMIT_SCRAPER_WINDOW_MS",
  "RATE_LIMIT_SCRAPER_MAX",
  "WIKIQUOTE_CACHE_TTL_MS",
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
    expect(config.isSupabaseConfigured).toBe(false);
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
    });
    expect(config.cache).toEqual({
      wikiquoteTtlMs: 3600000,
    });
  });

  it("parses valid env values and prefers the service role key", async () => {
    vi.stubEnv("PORT", "8080");
    vi.stubEnv("BASE_URL", "https://api.example.com");
    vi.stubEnv("RATE_LIMIT_GLOBAL_WINDOW_MS", "60000");
    vi.stubEnv("RATE_LIMIT_GLOBAL_MAX", "100");
    vi.stubEnv("RATE_LIMIT_SCRAPER_WINDOW_MS", "30000");
    vi.stubEnv("RATE_LIMIT_SCRAPER_MAX", "10");
    vi.stubEnv("WIKIQUOTE_CACHE_TTL_MS", "120000");
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
    expect(config.visitorHashSalt).toBe("salt-value");
    expect(config.rateLimit).toEqual({
      global: {
        windowMs: 60000,
        max: 100,
      },
      scraper: {
        windowMs: 30000,
        max: 10,
      },
    });
    expect(config.cache).toEqual({
      wikiquoteTtlMs: 120000,
    });
  });

  it("allows fully missing Supabase config", async () => {
    const { parseEnv } = await import("../src/config");

    const env = parseEnv({});

    expect(env).not.toHaveProperty("SUPABASE_URL");
    expect(env).not.toHaveProperty("SUPABASE_ANON_KEY");
    expect(env).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
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

  it("rejects partial Supabase config", async () => {
    const { parseEnv } = await import("../src/config");

    expect(() => parseEnv({ SUPABASE_URL: "https://project.supabase.co" })).toThrow(/Supabase config/);
    expect(() => parseEnv({ SUPABASE_ANON_KEY: "anon-key" })).toThrow(/Supabase config/);
  });
});
