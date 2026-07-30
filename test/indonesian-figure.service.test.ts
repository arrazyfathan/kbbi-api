import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "test", "fixtures", name), "utf8");
}

describe("IndonesianFigureService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("lists summary items by default without fetching detail pages", async () => {
    const getScraperHtml = vi.fn(async (url: string) => {
      if (url.includes("pagefrom=Hatta")) {
        return '<html><body><div id="mw-pages"></div></body></html>';
      }

      return fixture("figure-category.html");
    });
    const { IndonesianFigureService } = await loadService(getScraperHtml);
    const service = new IndonesianFigureService();

    const result = await service.list(1, 2);

    expect(result.items).toEqual([
      {
        name: "Soekarno",
        slug: "Soekarno",
        sourceUrl: "https://id.wikiquote.org/wiki/Soekarno",
      },
      {
        name: "Cut Nyak Dien",
        slug: "Cut_Nyak_Dien",
        sourceUrl: "https://id.wikiquote.org/w/index.php?title=Cut_Nyak_Dien",
      },
    ]);
    expect(result.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 2,
      totalPages: 1,
    });
    expect(getScraperHtml).not.toHaveBeenCalledWith("https://id.wikiquote.org/wiki/Soekarno");
    expect(getScraperHtml).not.toHaveBeenCalledWith("https://id.wikiquote.org/w/index.php?title=Cut_Nyak_Dien");
  });

  it("searches summary items by default without fetching detail pages", async () => {
    const getScraperHtml = vi.fn(async (url: string) => {
      if (url.includes("pagefrom=Hatta")) {
        return '<html><body><div id="mw-pages"></div></body></html>';
      }

      return fixture("figure-category.html");
    });
    const { IndonesianFigureService } = await loadService(getScraperHtml);
    const service = new IndonesianFigureService();

    const result = await service.search("soekarno", 1, 20);

    expect(result.items).toEqual([
      {
        name: "Soekarno",
        slug: "Soekarno",
        sourceUrl: "https://id.wikiquote.org/wiki/Soekarno",
      },
    ]);
    expect(result.pagination.total).toBe(1);
    expect(getScraperHtml).not.toHaveBeenCalledWith("https://id.wikiquote.org/wiki/Soekarno");
  });

  it("fetches details with bounded concurrency when includeDetails is true", async () => {
    let activeDetailRequests = 0;
    let maxActiveDetailRequests = 0;
    let detailRequestCount = 0;
    const getScraperHtml = vi.fn(async (url: string) => {
      if (url.includes("Kategori:Tokoh_Indonesia")) {
        return createCategoryHtml(7);
      }

      detailRequestCount += 1;
      activeDetailRequests += 1;
      maxActiveDetailRequests = Math.max(maxActiveDetailRequests, activeDetailRequests);
      await delay(5);
      activeDetailRequests -= 1;

      return fixture("figure-detail.html");
    });
    const { IndonesianFigureService } = await loadService(getScraperHtml);
    const service = new IndonesianFigureService();

    const result = await service.list(1, 7, { includeDetails: true });

    expect(result.items).toHaveLength(7);
    expect(result.items[0]).toMatchObject({
      name: "Figure 1",
      slug: "Figure_1",
      photo: "https://upload.wikimedia.org/soekarno.jpg",
      quotes: ["Gantungkan cita-citamu setinggi langit", "Jas merah"],
    });
    expect(detailRequestCount).toBe(7);
    expect(maxActiveDetailRequests).toBeLessThanOrEqual(5);
  });

  it("reuses list cache before TTL expires", async () => {
    let now = 0;
    const getScraperHtml = vi.fn(async (url: string) => {
      if (url.includes("pagefrom=Hatta")) {
        return '<html><body><div id="mw-pages"></div></body></html>';
      }

      return fixture("figure-category.html");
    });
    const { IndonesianFigureService } = await loadService(getScraperHtml);
    const service = new IndonesianFigureService({ now: () => now });

    await service.list(1, 20);
    now = 1000;
    await service.search("soekarno", 1, 20);

    expect(getScraperHtml).toHaveBeenCalledTimes(2);
  });

  it("logs list cache misses and hits", async () => {
    let now = 0;
    const logger = { info: vi.fn() };
    const getScraperHtml = vi.fn(async (url: string) => {
      if (url.includes("pagefrom=Hatta")) {
        return '<html><body><div id="mw-pages"></div></body></html>';
      }

      return fixture("figure-category.html");
    });

    vi.doMock("../src/lib/logger", () => ({
      default: logger,
    }));

    const { IndonesianFigureService } = await loadService(getScraperHtml);
    const service = new IndonesianFigureService({ now: () => now });

    await service.list(1, 20);
    now = 1000;
    await service.search("soekarno", 1, 20);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cache_lookup",
        cacheName: "wikiquote_figure_list",
        cacheKey: "all",
        cacheHit: false,
        ttlMs: 3600000,
      }),
      "Scraper cache miss",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cache_lookup",
        cacheName: "wikiquote_figure_list",
        cacheKey: "all",
        cacheHit: true,
        ttlMs: 3600000,
      }),
      "Scraper cache hit",
    );
  });

  it("fetches list data again after TTL expires", async () => {
    let now = 0;
    const getScraperHtml = vi.fn(async (url: string) => {
      if (url.includes("pagefrom=Hatta")) {
        return '<html><body><div id="mw-pages"></div></body></html>';
      }

      return fixture("figure-category.html");
    });
    const { IndonesianFigureService } = await loadService(getScraperHtml);
    const service = new IndonesianFigureService({ now: () => now });

    await service.list(1, 20);
    now = 3600000;
    await service.list(1, 20);

    expect(getScraperHtml).toHaveBeenCalledTimes(4);
  });

  it("reuses detail cache before TTL expires", async () => {
    let now = 0;
    const getScraperHtml = vi.fn(async () => fixture("figure-detail.html"));
    const { IndonesianFigureService } = await loadService(getScraperHtml);
    const service = new IndonesianFigureService({ now: () => now });

    await service.detail("Soekarno", {
      name: "Soekarno",
      slug: "Soekarno",
      sourceUrl: "https://id.wikiquote.org/wiki/Soekarno",
    });
    now = 1000;
    await service.detail("Soekarno", {
      name: "Soekarno",
      slug: "Soekarno",
      sourceUrl: "https://id.wikiquote.org/wiki/Soekarno",
    });

    expect(getScraperHtml).toHaveBeenCalledTimes(1);
  });

  it("fetches detail data again after TTL expires", async () => {
    let now = 0;
    const getScraperHtml = vi.fn(async () => fixture("figure-detail.html"));
    const { IndonesianFigureService } = await loadService(getScraperHtml);
    const service = new IndonesianFigureService({ now: () => now });

    await service.detail("Soekarno", {
      name: "Soekarno",
      slug: "Soekarno",
      sourceUrl: "https://id.wikiquote.org/wiki/Soekarno",
    });
    now = 3600000;
    await service.detail("Soekarno", {
      name: "Soekarno",
      slug: "Soekarno",
      sourceUrl: "https://id.wikiquote.org/wiki/Soekarno",
    });

    expect(getScraperHtml).toHaveBeenCalledTimes(2);
  });
});

async function loadService(getScraperHtml: (url: string) => Promise<string>) {
  vi.doMock("../src/lib/http-client", () => ({
    getScraperHtml,
    isHttpNotFound: () => false,
  }));

  return await import("../src/features/figures/indonesian-figure.service");
}

function createCategoryHtml(count: number): string {
  const links = Array.from({ length: count }, (_, index) => {
    const number = index + 1;

    return `<a href="/wiki/Figure_${number}">Figure ${number}</a>`;
  }).join("");

  return `<html><body><div id="mw-pages"><div class="mw-category">${links}</div></div></body></html>`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
