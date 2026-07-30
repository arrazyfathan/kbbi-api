import config from "../../config";
import { getScraperHtml, isHttpNotFound } from "../../lib/http-client";
import logger from "../../lib/logger";
import { TtlCache } from "../../lib/ttl-cache";
import {
  getProverbUrl,
  normalizeProverbSearchText,
  normalizeProverbSlug,
  parseProverbDetailHtml,
  parseProverbListHtml,
} from "./proverb.parser";
import type { PaginatedProverbList, Proverb, ProverbDetail, ProverbList } from "./proverb.types";

type Clock = () => number;

const proverbListCacheKey = "all";

export class ProverbService {
  private readonly now: Clock;
  private readonly cache: TtlCache<typeof proverbListCacheKey, ProverbList>;
  private readonly detailCache: TtlCache<string, ProverbDetail>;
  private readonly sourceUrl = config.wikiquoteProverbUrl;
  private readonly cacheTtlMs = config.cache.wikiquoteTtlMs;

  constructor(options: { now?: Clock } = {}) {
    this.now = options.now || Date.now;
    this.cache = new TtlCache<typeof proverbListCacheKey, ProverbList>({
      ttlMs: config.cache.wikiquoteTtlMs,
      now: () => this.now(),
    });
    this.detailCache = new TtlCache<string, ProverbDetail>({
      ttlMs: config.cache.wikiquoteTtlMs,
      now: () => this.now(),
    });
  }

  async list(page = 1, limit = 20): Promise<PaginatedProverbList> {
    const data = await this.getAll();
    return this.paginate(data.items, page, limit);
  }

  async search(query: string, page = 1, limit = 20): Promise<PaginatedProverbList> {
    const data = await this.getAll();
    const normalizedQuery = this.normalizeSearchText(query);
    const items = data.items.filter((item) => this.normalizeSearchText(item.text).includes(normalizedQuery));

    return this.paginate(items, page, limit);
  }

  async detail(slug: string): Promise<ProverbDetail | null> {
    const normalizedSlug = this.normalizeSlug(slug);

    if (!normalizedSlug) {
      return null;
    }

    const cached = this.detailCache.get(normalizedSlug);
    this.logCache("wikiquote_proverb_detail", normalizedSlug, Boolean(cached));

    if (cached) {
      return cached;
    }

    const data = await this.getAll();
    const proverb = data.items.find((item) => item.slug === normalizedSlug);
    let html: string;

    try {
      html = await this.fetchHtml(this.getProverbUrl(normalizedSlug));
    } catch (error: any) {
      if (isHttpNotFound(error)) {
        return null;
      }

      throw error;
    }

    const parsed = this.parseDetailHtml(html, proverb);

    this.detailCache.set(normalizedSlug, parsed);

    return parsed;
  }

  private async getAll(): Promise<ProverbList> {
    const cached = this.cache.get(proverbListCacheKey);
    this.logCache("wikiquote_proverb_list", proverbListCacheKey, Boolean(cached));

    if (cached) {
      return cached;
    }

    const html = await this.fetchHtml(this.sourceUrl);
    const items = this.parseHtml(html);

    const data = {
      source: this.sourceUrl,
      count: items.length,
      items,
    };

    this.cache.set(proverbListCacheKey, data);

    return data;
  }

  private async fetchHtml(url: string): Promise<string> {
    return getScraperHtml(url, { upstream: "wikiquote" });
  }

  private parseHtml(html: string): Proverb[] {
    return parseProverbListHtml(html, this.sourceUrl);
  }

  private parseDetailHtml(html: string, fallback?: Proverb): ProverbDetail {
    return parseProverbDetailHtml(html, { fallback, sourceUrl: this.sourceUrl });
  }

  private paginate(items: Proverb[], page: number, limit: number): PaginatedProverbList {
    const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20;
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
    return normalizeProverbSearchText(value);
  }

  private normalizeSlug(value: string): string {
    return normalizeProverbSlug(value);
  }

  private getProverbUrl(slug: string): string {
    return getProverbUrl(slug, this.sourceUrl);
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
}
