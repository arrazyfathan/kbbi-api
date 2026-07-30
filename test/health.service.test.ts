import { beforeEach, describe, expect, it, vi } from "vitest";

describe("HealthService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("skips Supabase readiness when Supabase is not configured", async () => {
    vi.doMock("../src/config", () => ({
      default: {
        isSupabaseConfigured: false,
      },
    }));

    const checkSupabase = vi.fn();
    const { HealthService } = await import("../src/features/health/health.service");
    const service = new HealthService(checkSupabase);

    await expect(service.ready()).resolves.toEqual({
      ready: true,
      dependencies: [
        {
          name: "supabase",
          status: "skipped",
          required: false,
          host: null,
        },
      ],
    });
    expect(checkSupabase).not.toHaveBeenCalled();
  });

  it("reports ready when configured Supabase is reachable", async () => {
    vi.doMock("../src/config", () => ({
      default: {
        isSupabaseConfigured: true,
      },
    }));

    const checkSupabase = vi.fn(async () => ({
      connected: true,
      host: "project.supabase.co",
      status: 200,
      statusText: "OK",
    }));
    const { HealthService } = await import("../src/features/health/health.service");
    const service = new HealthService(checkSupabase);

    await expect(service.ready()).resolves.toEqual({
      ready: true,
      dependencies: [
        {
          name: "supabase",
          status: "ok",
          required: true,
          host: "project.supabase.co",
          statusCode: 200,
          statusText: "OK",
          error: undefined,
        },
      ],
    });
  });

  it("reports not ready when configured Supabase fails", async () => {
    vi.doMock("../src/config", () => ({
      default: {
        isSupabaseConfigured: true,
      },
    }));

    const checkSupabase = vi.fn(async () => ({
      connected: false,
      host: "project.supabase.co",
      status: 503,
      statusText: "Service Unavailable",
      error: "unavailable",
    }));
    const { HealthService } = await import("../src/features/health/health.service");
    const service = new HealthService(checkSupabase);

    await expect(service.ready()).resolves.toEqual({
      ready: false,
      dependencies: [
        {
          name: "supabase",
          status: "failed",
          required: true,
          host: "project.supabase.co",
          statusCode: 503,
          statusText: "Service Unavailable",
          error: "unavailable",
        },
      ],
    });
  });
});
