import axios from "axios";
import * as cheerio from "cheerio";
import config from "../config";
import { PaginatedProverbList, Proverb, ProverbDetail, ProverbList } from "../interfaces/kbbi.interface";

export class ProverbService {
  private static cache: ProverbList | null = null;
  private static detailCache = new Map<string, ProverbDetail>();
  private static readonly sourceUrl = config.wikiquoteProverbUrl;

  static async list(page = 1, limit = 20): Promise<PaginatedProverbList> {
    const data = await this.getAll();
    return this.paginate(data.items, page, limit);
  }

  static async search(query: string, page = 1, limit = 20): Promise<PaginatedProverbList> {
    const data = await this.getAll();
    const normalizedQuery = this.normalizeSearchText(query);
    const items = data.items.filter((item) => this.normalizeSearchText(item.text).includes(normalizedQuery));

    return this.paginate(items, page, limit);
  }

  static async detail(slug: string): Promise<ProverbDetail | null> {
    const normalizedSlug = this.normalizeSlug(slug);

    if (!normalizedSlug) {
      return null;
    }

    const cached = this.detailCache.get(normalizedSlug);

    if (cached) {
      return cached;
    }

    const data = await this.getAll();
    const proverb = data.items.find((item) => item.slug === normalizedSlug);
    let html: string;

    try {
      html = await this.fetchHtml(this.getProverbUrl(normalizedSlug));
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }

      throw error;
    }

    const parsed = this.parseDetailHtml(html, proverb);

    this.detailCache.set(normalizedSlug, parsed);

    return parsed;
  }

  private static async getAll(): Promise<ProverbList> {
    if (this.cache) {
      return this.cache;
    }

    const html = await this.fetchHtml(this.sourceUrl);
    const items = this.parseHtml(html);

    this.cache = {
      source: this.sourceUrl,
      count: items.length,
      items,
    };

    return this.cache;
  }

  private static async fetchHtml(url: string): Promise<string> {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KBBI-API/1.1; +https://github.com/)",
      },
    });

    return response.data;
  }

  private static parseHtml(html: string): Proverb[] {
    const $ = cheerio.load(html);
    const items: Proverb[] = [];
    const seen = new Set<string>();

    $("#mw-content-text h2, .mw-parser-output h2").each((_, heading) => {
      const letter = $(heading).find(".mw-headline").text().trim() || $(heading).text().trim();

      if (!/^[A-Z]$/.test(letter)) {
        return;
      }

      const sectionHeading = $(heading).parent().hasClass("mw-heading") ? $(heading).parent() : $(heading);

      sectionHeading
        .nextUntil(".mw-heading2, h2")
        .find("li")
        .each((_, li) => {
          const firstLink = $(li).find("a").first();
          const text = this.normalizeText(firstLink.text() || $(li).text());

          if (!text) {
            return;
          }

          const key = text.toLocaleLowerCase("id-ID");

          if (seen.has(key)) {
            return;
          }

          seen.add(key);

          const href = firstLink.attr("href");
          const sourceUrl = href ? new URL(href, this.sourceUrl).toString() : undefined;
          const slug = this.slugFromUrl(sourceUrl) || this.slugFromText(text);

          items.push({
            text,
            letter,
            slug,
            sourceUrl,
          });
        });
    });

    return items;
  }

  private static parseDetailHtml(html: string, fallback?: Proverb): ProverbDetail {
    const $ = cheerio.load(html);
    const title = this.normalizeText($("h1").first().text());
    const paragraphs = $("#mw-content-text .mw-parser-output > p")
      .map((_, paragraph) => this.normalizeText($(paragraph).text()))
      .get()
      .filter(Boolean);

    const text = fallback?.text || paragraphs[0] || title;
    const meaning = this.extractMeaning($);
    const slug = fallback?.slug || this.slugFromText(title || text);

    return {
      text,
      letter: fallback?.letter || text.charAt(0).toLocaleUpperCase("id-ID"),
      slug,
      sourceUrl: fallback?.sourceUrl || this.getProverbUrl(slug),
      meaning,
    };
  }

  private static extractMeaning($: cheerio.CheerioAPI): string | null {
    const content = $("#mw-content-text .mw-parser-output").first();
    let meaning: string | null = null;

    content.children().each((_, element) => {
      if (meaning !== null) {
        return false;
      }

      const current = $(element);
      const currentText = this.normalizeText(current.text());
      const inlineMeaning = currentText.match(/^artinya\s*:\s*(.+)$/i);

      if (inlineMeaning?.[1]) {
        meaning = this.normalizeText(inlineMeaning[1]);
        return false;
      }

      if (!/^artinya\s*:?\s*$/i.test(currentText)) {
        return;
      }

      const nextMeaningItems = current
        .nextUntil("h2, h3, h4, .mw-heading")
        .filter("ol, ul")
        .first()
        .find("li")
        .map((_, item) => this.normalizeText($(item).text()))
        .get()
        .filter(Boolean);

      if (nextMeaningItems.length > 0) {
        meaning = nextMeaningItems.join("; ");
      }
    });

    return meaning || null;
  }

  private static paginate(items: Proverb[], page: number, limit: number): PaginatedProverbList {
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

  private static normalizeText(value: string): string {
    return value
      .replace(/\s+/g, " ")
      .replace(/^["'“”]+/, "")
      .replace(/["'“”\s.]+$/, "")
      .trim();
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

  private static getProverbUrl(slug: string): string {
    return new URL(`/wiki/${encodeURIComponent(slug)}`, this.sourceUrl).toString();
  }
}
