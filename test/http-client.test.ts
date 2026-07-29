import { beforeEach, describe, expect, it, vi } from "vitest";

describe("scraper http client observability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("logs upstream request duration and metadata on success", async () => {
    const get = vi.fn(async () => ({
      status: 200,
      data: "<html></html>",
    }));
    const logger = mockHttpClientDependencies(get);
    const { getScraperHtml } = await import("../src/lib/http-client");

    await expect(getScraperHtml("https://id.wikiquote.org/wiki/Peribahasa_Indonesia")).resolves.toBe("<html></html>");

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "upstream_request",
        upstream: "wikiquote",
        urlHost: "id.wikiquote.org",
        attempts: 1,
        status: 200,
        success: true,
        durationMs: expect.any(Number),
      }),
      "Upstream scraper request completed",
    );
  });

  it("logs upstream failure metadata and maps upstream errors", async () => {
    const upstreamError = {
      isAxiosError: true,
      code: "ETIMEDOUT",
      response: undefined,
    };
    const get = vi.fn(async () => {
      throw upstreamError;
    });
    const logger = mockHttpClientDependencies(get);
    const { UpstreamHttpError, getScraperHtml } = await import("../src/lib/http-client");

    await expect(
      getScraperHtml("https://kbbi.example.test/entri/ajar", { upstream: "kbbi", retryDelayMs: 0 }),
    ).rejects.toMatchObject({
      name: "UpstreamHttpError",
      statusCode: 504,
      upstream: "kbbi",
      urlHost: "kbbi.example.test",
      attempts: 3,
      errorCode: "ETIMEDOUT",
    });
    await expect(getScraperHtml("https://kbbi.example.test/entri/ajar", { retries: 0 })).rejects.toBeInstanceOf(
      UpstreamHttpError,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "upstream_request",
        upstream: "kbbi",
        urlHost: "kbbi.example.test",
        attempts: 3,
        success: false,
        errorCode: "ETIMEDOUT",
      }),
      "Upstream scraper request failed",
    );
  });
});

function mockHttpClientDependencies(get: ReturnType<typeof vi.fn>) {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
  };

  vi.doMock("../src/lib/logger", () => ({
    default: logger,
  }));
  vi.doMock("axios", () => ({
    default: {
      create: () => ({ get }),
      isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
    },
  }));

  return logger;
}
