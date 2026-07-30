import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "test", "fixtures", name), "utf8");
}

describe("ProverbService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reuses list cache before TTL expires", async () => {
    let now = 0;
    const getScraperHtml = vi.fn(async () => fixture("proverb-list.html"));
    const { ProverbService } = await loadService(getScraperHtml);
    const service = new ProverbService({ now: () => now });

    await service.list(1, 20);
    now = 1000;
    await service.search("air", 1, 20);

    expect(getScraperHtml).toHaveBeenCalledTimes(1);
  });

  it("logs list cache misses and hits", async () => {
    let now = 0;
    const logger = { info: vi.fn() };
    const getScraperHtml = vi.fn(async () => fixture("proverb-list.html"));

    vi.doMock("../src/lib/logger", () => ({
      default: logger,
    }));

    const { ProverbService } = await loadService(getScraperHtml);
    const service = new ProverbService({ now: () => now });

    await service.list(1, 20);
    now = 1000;
    await service.search("air", 1, 20);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cache_lookup",
        cacheName: "wikiquote_proverb_list",
        cacheKey: "all",
        cacheHit: false,
        ttlMs: 3600000,
      }),
      "Scraper cache miss",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cache_lookup",
        cacheName: "wikiquote_proverb_list",
        cacheKey: "all",
        cacheHit: true,
        ttlMs: 3600000,
      }),
      "Scraper cache hit",
    );
  });

  it("fetches list data again after TTL expires", async () => {
    let now = 0;
    const getScraperHtml = vi.fn(async () => fixture("proverb-list.html"));
    const { ProverbService } = await loadService(getScraperHtml);
    const service = new ProverbService({ now: () => now });

    await service.list(1, 20);
    now = 3600000;
    await service.list(1, 20);

    expect(getScraperHtml).toHaveBeenCalledTimes(2);
  });

  it("reuses detail cache before TTL expires", async () => {
    let now = 0;
    const getScraperHtml = vi.fn(async (url: string) =>
      url.includes("Peribahasa_Indonesia") ? fixture("proverb-list.html") : fixture("proverb-detail.html"),
    );
    const { ProverbService } = await loadService(getScraperHtml);
    const service = new ProverbService({ now: () => now });

    await service.detail("Ada_gula_ada_semut");
    now = 1000;
    await service.detail("Ada_gula_ada_semut");

    expect(getScraperHtml).toHaveBeenCalledTimes(2);
    expect(getScraperHtml).toHaveBeenCalledWith("https://id.wikiquote.org/wiki/Peribahasa_Indonesia", {
      upstream: "wikiquote",
    });
    expect(getScraperHtml).toHaveBeenCalledWith("https://id.wikiquote.org/wiki/Ada_gula_ada_semut", {
      upstream: "wikiquote",
    });
  });

  it("fetches detail data again after TTL expires", async () => {
    let now = 0;
    const getScraperHtml = vi.fn(async (url: string) =>
      url.includes("Peribahasa_Indonesia") ? fixture("proverb-list.html") : fixture("proverb-detail.html"),
    );
    const { ProverbService } = await loadService(getScraperHtml);
    const service = new ProverbService({ now: () => now });

    await service.detail("Ada_gula_ada_semut");
    now = 3600000;
    await service.detail("Ada_gula_ada_semut");

    expect(getScraperHtml).toHaveBeenCalledTimes(4);
  });
});

async function loadService(getScraperHtml: (url: string) => Promise<string>) {
  vi.doMock("../src/lib/http-client", () => ({
    getScraperHtml,
    isHttpNotFound: () => false,
  }));

  return await import("../src/features/proverbs/proverb.service");
}
