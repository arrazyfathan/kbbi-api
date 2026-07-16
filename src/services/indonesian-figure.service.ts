import * as cheerio from "cheerio";
import config from "../config";
import {
  IndonesianFigure,
  IndonesianFigureList,
  IndonesianFigureSummary,
  PaginatedIndonesianFigureList,
} from "../interfaces/kbbi.interface";
import { getScraperHtml, isHttpNotFound } from "../lib/http-client";

export class IndonesianFigureService {
  private static cache: IndonesianFigureList | null = null;
  private static detailCache = new Map<string, IndonesianFigure>();
  private static readonly sourceUrl = config.wikiquoteIndonesianFigureUrl;

  static async list(page = 1, limit = 20): Promise<PaginatedIndonesianFigureList> {
    const data = await this.getAll();
    const paginated = this.paginate(data.items, page, limit);
    const items = await Promise.all(paginated.items.map((item) => this.detail(item.slug, item)));

    return {
      ...paginated,
      items: items.filter((item): item is IndonesianFigure => item !== null),
    };
  }

  static async search(query: string, page = 1, limit = 20): Promise<PaginatedIndonesianFigureList> {
    const data = await this.getAll();
    const normalizedQuery = this.normalizeSearchText(query);
    const items = data.items.filter((item) => this.normalizeSearchText(item.name || "").includes(normalizedQuery));
    const paginated = this.paginate(items, page, limit);
    const details = await Promise.all(paginated.items.map((item) => this.detail(item.slug, item)));

    return {
      ...paginated,
      items: details.filter((item): item is IndonesianFigure => item !== null),
    };
  }

  static async detail(slug: string, fallback?: IndonesianFigureSummary): Promise<IndonesianFigure | null> {
    const normalizedSlug = this.normalizeSlug(slug);

    if (!normalizedSlug) {
      return null;
    }

    const cached = this.detailCache.get(normalizedSlug);

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

  private static async getAll(): Promise<IndonesianFigureList> {
    if (this.cache) {
      return this.cache;
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

    this.cache = {
      source: this.sourceUrl,
      count: items.length,
      items,
    };

    return this.cache;
  }

  private static async fetchHtml(url: string): Promise<string> {
    return getScraperHtml(url);
  }

  private static parseCategoryHtml(html: string, currentUrl: string): { items: IndonesianFigureSummary[]; nextUrl: string | null } {
    const $ = cheerio.load(html);
    const items: IndonesianFigureSummary[] = [];

    $("#mw-pages .mw-category a").each((_, link) => {
      const name = this.normalizeText($(link).text()) || null;
      const href = $(link).attr("href");
      const sourceUrl = href ? new URL(href, currentUrl).toString() : "";
      const slug = this.slugFromUrl(sourceUrl);

      if (!slug || !sourceUrl) {
        return;
      }

      items.push({
        name,
        slug,
        sourceUrl,
      });
    });

    const nextHref =
      $("#mw-pages > a")
        .filter((_, link) => /halaman selanjutnya/i.test($(link).text()))
        .last()
        .attr("href") || null;

    return {
      items,
      nextUrl: nextHref ? new URL(nextHref, currentUrl).toString() : null,
    };
  }

  private static parseDetailHtml(html: string, fallback?: IndonesianFigureSummary): IndonesianFigure {
    const $ = cheerio.load(html);
    const title = this.normalizeText($("h1").first().text());
    const name = fallback?.name || title || null;
    const slug = fallback?.slug || this.slugFromText(title || name || "");
    const sourceUrl = fallback?.sourceUrl || this.getFigureUrl(slug);
    const description = this.extractDescription($);
    const photo = this.extractPhoto($, sourceUrl);
    const quotes = this.extractQuotes($);

    return {
      name,
      slug,
      sourceUrl,
      photo,
      description,
      quotes: quotes.length > 0 ? quotes : null,
    };
  }

  private static extractDescription($: cheerio.CheerioAPI): string | null {
    const paragraphs = $("#mw-content-text .mw-parser-output > p")
      .map((_, paragraph) => this.normalizeText($(paragraph).text()))
      .get()
      .filter(Boolean);

    return paragraphs[0] || null;
  }

  private static extractPhoto($: cheerio.CheerioAPI, sourceUrl: string): string | null {
    const ignoredImagePattern = /(Commons-logo|Wikipedia-logo|Wikisource-logo|Wikiquote-logo|OOjs_UI_icon)/i;
    let photo: string | null = null;

    $("#mw-content-text .mw-parser-output figure img, #mw-content-text .mw-parser-output .infobox img").each((_, image) => {
      if (photo) {
        return false;
      }

      const src = $(image).attr("src");

      if (!src || ignoredImagePattern.test(src)) {
        return;
      }

      photo = new URL(src, sourceUrl).toString();
    });

    return photo;
  }

  private static extractQuotes($: cheerio.CheerioAPI): string[] {
    const content = $("#mw-content-text .mw-parser-output").first();
    const quotes: string[] = [];
    const seen = new Set<string>();
    let inQuoteSection = false;

    content.children().each((_, element) => {
      const current = $(element);
      const heading = this.normalizeSearchText(current.find("h2, h3, .mw-headline").first().text() || current.text());

      if (current.is("h2, h3, .mw-heading")) {
        inQuoteSection = /^(kutipan|ucapan|perkataan|quotes?)/i.test(heading);
        return;
      }

      if (!inQuoteSection || !current.is("ul, ol")) {
        return;
      }

      current.children("li").each((_, item) => {
        const quote = this.normalizeQuoteText(this.textWithoutNestedLists($, $(item)));
        const key = this.normalizeSearchText(quote);

        if (!quote || seen.has(key)) {
          return;
        }

        seen.add(key);
        quotes.push(quote);
      });
    });

    if (quotes.length > 0) {
      return quotes;
    }

    content.children("ul, ol").children("li").each((_, item) => {
      const quote = this.normalizeQuoteText(this.textWithoutNestedLists($, $(item)));
      const key = this.normalizeSearchText(quote);

      if (!quote || seen.has(key)) {
        return;
      }

      seen.add(key);
      quotes.push(quote);
    });

    return quotes;
  }

  private static textWithoutNestedLists($: cheerio.CheerioAPI, item: cheerio.Cheerio<any>): string {
    const clone = item.clone();
    clone.find("ul, ol, table, style, script").remove();

    return this.normalizeText(clone.text());
  }

  private static paginate(
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

  private static normalizeText(value: string): string {
    return value
      .replace(/\[\s*sunting(?: sumber)?\s*\]/gi, "")
      .replace(/\s+/g, " ")
      .replace(/^["'“”]+/, "")
      .replace(/["'“”\s]+$/, "")
      .trim();
  }

  private static normalizeQuoteText(value: string): string {
    return this.normalizeText(value).replace(/[.。]\s*$/, "").trim();
  }

  private static normalizeSearchText(value: string): string {
    return this.normalizeText(value).toLocaleLowerCase("id-ID");
  }

  private static normalizeSlug(value: string): string {
    return decodeURIComponent(value).trim().replace(/\s+/g, "_");
  }

  private static slugFromText(value: string): string {
    return this.normalizeText(value).replace(/\s+/g, "_");
  }

  private static slugFromUrl(value?: string): string | null {
    if (!value) {
      return null;
    }

    const url = new URL(value);
    const title = url.searchParams.get("title");
    const slug = title || url.pathname.split("/").pop();

    return slug ? this.normalizeSlug(slug) : null;
  }

  private static getFigureUrl(slug: string): string {
    return new URL(`/wiki/${encodeURIComponent(slug)}`, this.sourceUrl).toString();
  }
}
