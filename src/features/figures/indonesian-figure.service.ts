import config from "../../config";
import {
  IndonesianFigure,
  IndonesianFigureList,
  IndonesianFigureSummary,
  PaginatedIndonesianFigureList,
} from "./figure.types";
import { getScraperHtml, isHttpNotFound } from "../../lib/http-client";
import logger from "../../lib/logger";
import { TtlCache } from "../../lib/ttl-cache";
import {
  getFigureUrl,
  normalizeFigureSearchText,
  normalizeFigureSlug,
  parseIndonesianFigureCategoryHtml,
  parseIndonesianFigureDetailHtml,
} from "./figure.parser";

type FigureListOptions = {
  includeDetails?: boolean;
};

type Clock = () => number;

const figureListCacheKey = "all";

export class IndonesianFigureService {
  private readonly now: Clock;
  private readonly cache: TtlCache<typeof figureListCacheKey, IndonesianFigureList>;
  private readonly detailCache: TtlCache<string, IndonesianFigure>;
  private readonly sourceUrl = config.wikiquoteIndonesianFigureUrl;
  private readonly detailConcurrencyLimit = 5;
  private readonly cacheTtlMs = config.cache.wikiquoteTtlMs;

  constructor(options: { now?: Clock } = {}) {
    this.now = options.now || Date.now;
    this.cache = new TtlCache<typeof figureListCacheKey, IndonesianFigureList>({
      ttlMs: config.cache.wikiquoteTtlMs,
      now: () => this.now(),
    });
    this.detailCache = new TtlCache<string, IndonesianFigure>({
      ttlMs: config.cache.wikiquoteTtlMs,
      now: () => this.now(),
    });
  }

  async list(page = 1, limit = 20, options: FigureListOptions = {}): Promise<PaginatedIndonesianFigureList> {
    const data = await this.getAll();
    const paginated = this.paginate(data.items, page, limit);

    return this.withOptionalDetails(paginated, options.includeDetails === true);
  }

  async search(
    query: string,
    page = 1,
    limit = 20,
    options: FigureListOptions = {},
  ): Promise<PaginatedIndonesianFigureList> {
    const data = await this.getAll();
    const normalizedQuery = this.normalizeSearchText(query);
    const items = data.items.filter((item) => this.normalizeSearchText(item.name || "").includes(normalizedQuery));
    const paginated = this.paginate(items, page, limit);

    return this.withOptionalDetails(paginated, options.includeDetails === true);
  }

  async detail(slug: string, fallback?: IndonesianFigureSummary): Promise<IndonesianFigure | null> {
    const normalizedSlug = this.normalizeSlug(slug);

    if (!normalizedSlug) {
      return null;
    }

    const cached = this.detailCache.get(normalizedSlug);
    this.logCache("wikiquote_figure_detail", normalizedSlug, Boolean(cached));

    if (cached) {
      return cached;
    }

    let summary = fallback;

    if (!summary) {
      const data = await this.getAll();
      summary = data.items.find((item) => item.slug === normalizedSlug);
    }

    let html: string;

    try {
      html = await this.fetchHtml(summary?.sourceUrl || this.getFigureUrl(normalizedSlug));
    } catch (error: any) {
      if (isHttpNotFound(error)) {
        return null;
      }

      throw error;
    }

    const parsed = this.parseDetailHtml(html, summary);
    this.detailCache.set(normalizedSlug, parsed);

    return parsed;
  }

  private async getAll(): Promise<IndonesianFigureList> {
    const cached = this.cache.get(figureListCacheKey);
    this.logCache("wikiquote_figure_list", figureListCacheKey, Boolean(cached));

    if (cached) {
      return cached;
    }

    const items: IndonesianFigureSummary[] = [];
    const seen = new Set<string>();
    let currentUrl: string | null = this.sourceUrl;

    while (currentUrl) {
      const html = await this.fetchHtml(currentUrl);
      const parsed = this.parseCategoryHtml(html, currentUrl);

      parsed.items.forEach((item) => {
        if (seen.has(item.slug)) {
          return;
        }

        seen.add(item.slug);
        items.push(item);
      });

      currentUrl = parsed.nextUrl;
    }

    const data = {
      source: this.sourceUrl,
      count: items.length,
      items,
    };

    this.cache.set(figureListCacheKey, data);

    return data;
  }

  private async fetchHtml(url: string): Promise<string> {
    return getScraperHtml(url, { upstream: "wikiquote" });
  }

  private parseCategoryHtml(
    html: string,
    currentUrl: string,
  ): { items: IndonesianFigureSummary[]; nextUrl: string | null } {
    return parseIndonesianFigureCategoryHtml(html, currentUrl);
  }

  private parseDetailHtml(html: string, fallback?: IndonesianFigureSummary): IndonesianFigure {
    return parseIndonesianFigureDetailHtml(html, { fallback, sourceUrl: this.sourceUrl });
  }

  private async withOptionalDetails(
    paginated: Omit<PaginatedIndonesianFigureList, "items"> & { items: IndonesianFigureSummary[] },
    includeDetails: boolean,
  ): Promise<PaginatedIndonesianFigureList> {
    if (!includeDetails) {
      return paginated;
    }

    const items = await this.mapWithConcurrency(
      paginated.items,
      this.detailConcurrencyLimit,
      async (item) => await this.detail(item.slug, item),
    );

    return {
      ...paginated,
      items: items.filter((item): item is IndonesianFigure => item !== null),
    };
  }

  private async mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    async function worker(): Promise<void> {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    }

    const workerCount = Math.min(Math.max(limit, 1), items.length);
    await Promise.all(Array.from({ length: workerCount }, worker));

    return results;
  }

  private logCache(cacheName: string, cacheKey: string, cacheHit: boolean): void {
    logger.info(
      {
        event: "cache_lookup",
        cacheName,
        cacheKey,
        cacheHit,
        ttlMs: this.cacheTtlMs,
      },
      cacheHit ? "Scraper cache hit" : "Scraper cache miss",
    );
  }

  private paginate(
    items: IndonesianFigureSummary[],
    page: number,
    limit: number,
  ): Omit<PaginatedIndonesianFigureList, "items"> & { items: IndonesianFigureSummary[] } {
    const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 20;
    const total = items.length;
    const totalPages = Math.max(Math.ceil(total / normalizedLimit), 1);
    const start = (normalizedPage - 1) * normalizedLimit;

    return {
      source: this.sourceUrl,
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages,
        hasNextPage: normalizedPage < totalPages,
        hasPreviousPage: normalizedPage > 1,
      },
      items: items.slice(start, start + normalizedLimit),
    };
  }

  private normalizeSearchText(value: string): string {
    return normalizeFigureSearchText(value);
  }

  private normalizeSlug(value: string): string {
    return normalizeFigureSlug(value);
  }

  private getFigureUrl(slug: string): string {
    return getFigureUrl(slug, this.sourceUrl);
  }
}
