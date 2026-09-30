import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  warn: vi.fn(),
  serviceRoleKey: "service-key" as string | undefined,
}));

vi.mock("../src/config", () => ({
  default: {
    upstream: { openAiTimeoutMs: 30000 },
    rateLimit: { ai: { windowMs: 900000, max: 10 } },
    get supabaseServiceRoleKey() {
      return mocks.serviceRoleKey;
    },
  },
}));
vi.mock("../src/config/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("../src/lib/logger", () => ({ default: { warn: mocks.warn } }));

describe("runtime API settings", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.rpc.mockReset();
    mocks.warn.mockReset();
    mocks.serviceRoleKey = "service-key";
  });

  it("loads settings from Supabase and caches them", async () => {
    mocks.rpc.mockResolvedValue({
      data: [runtimeRow({ openai_timeout_ms: 45000, ai_rate_limit_window_ms: 120000, ai_rate_limit_max: 6 })],
      error: null,
    });
    const { getRuntimeApiSettings } = await import("../src/config/runtime-api-settings");

    await expect(getRuntimeApiSettings()).resolves.toEqual({
      openaiTimeoutMs: 45000,
      aiRateLimitWindowMs: 120000,
      aiRateLimitMax: 6,
      globalRateLimitWindowMs: 900000,
      globalRateLimitMax: 300,
      scraperRateLimitWindowMs: 900000,
      scraperRateLimitMax: 30,
      wikiquoteCacheTtlMs: 3600000,
      kbbiFetchTimeoutMs: 45000,
      googleTranslateTimeoutMs: 10000,
      translateCacheTtlMs: 3600000,
      laraTranslateTimeoutMs: 10000,
      laraCredentialMode: "environment",
    });
    await getRuntimeApiSettings();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("get_runtime_api_settings");
  });

  it("uses environment values when Supabase settings cannot be loaded", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("database unavailable") });
    const { getRuntimeApiSettings } = await import("../src/config/runtime-api-settings");

    await expect(getRuntimeApiSettings()).resolves.toEqual({
      openaiTimeoutMs: 30000,
      aiRateLimitWindowMs: 900000,
      aiRateLimitMax: 10,
      globalRateLimitWindowMs: 900000,
      globalRateLimitMax: 300,
      scraperRateLimitWindowMs: 900000,
      scraperRateLimitMax: 30,
      wikiquoteCacheTtlMs: 3600000,
      kbbiFetchTimeoutMs: 45000,
      googleTranslateTimeoutMs: 10000,
      translateCacheTtlMs: 3600000,
      laraTranslateTimeoutMs: 10000,
      laraCredentialMode: "environment",
    });
    expect(mocks.warn).toHaveBeenCalledOnce();
  });

  it("uses environment values without a service-role key", async () => {
    mocks.serviceRoleKey = undefined;
    const { getRuntimeApiSettings } = await import("../src/config/runtime-api-settings");

    await expect(getRuntimeApiSettings()).resolves.toEqual({
      openaiTimeoutMs: 30000,
      aiRateLimitWindowMs: 900000,
      aiRateLimitMax: 10,
      globalRateLimitWindowMs: 900000,
      globalRateLimitMax: 300,
      scraperRateLimitWindowMs: 900000,
      scraperRateLimitMax: 30,
      wikiquoteCacheTtlMs: 3600000,
      kbbiFetchTimeoutMs: 45000,
      googleTranslateTimeoutMs: 10000,
      translateCacheTtlMs: 3600000,
      laraTranslateTimeoutMs: 10000,
      laraCredentialMode: "environment",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

function runtimeRow(overrides: Record<string, unknown> = {}) {
  return {
    openai_timeout_ms: 30000,
    ai_rate_limit_window_ms: 900000,
    ai_rate_limit_max: 10,
    global_rate_limit_window_ms: 900000,
    global_rate_limit_max: 300,
    scraper_rate_limit_window_ms: 900000,
    scraper_rate_limit_max: 30,
    wikiquote_cache_ttl_ms: 3600000,
    kbbi_fetch_timeout_ms: 45000,
    google_translate_timeout_ms: 10000,
    translate_cache_ttl_ms: 3600000,
    lara_translate_timeout_ms: 10000,
    lara_credential_mode: "environment",
    ...overrides,
  };
}
