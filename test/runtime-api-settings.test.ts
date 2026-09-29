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
    get supabaseServiceRoleKey() { return mocks.serviceRoleKey; },
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
      data: [{ openai_timeout_ms: 45000, ai_rate_limit_window_ms: 120000, ai_rate_limit_max: 6 }],
      error: null,
    });
    const { getRuntimeApiSettings } = await import("../src/config/runtime-api-settings");

    await expect(getRuntimeApiSettings()).resolves.toEqual({
      openaiTimeoutMs: 45000,
      aiRateLimitWindowMs: 120000,
      aiRateLimitMax: 6,
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
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
