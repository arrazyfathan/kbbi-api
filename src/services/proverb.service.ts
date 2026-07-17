import * as cheerio from "cheerio";
import config from "../config";
import { PaginatedProverbList, Proverb, ProverbDetail, ProverbList } from "../interfaces/kbbi.interface";
import { getScraperHtml, isHttpNotFound } from "../lib/http-client";

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
      if (isHttpNotFound(error)) {
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
    return getScraperHtml(url);
  }

  private static parseHtml(html: string): Proverb[] {
    return parseProverbListHtml(html, this.sourceUrl);
  }

  private static parseDetailHtml(html: string, fallback?: Proverb): ProverbDetail {
    return parseProverbDetailHtml(html, { fallback, sourceUrl: this.sourceUrl });
  }

  private static extractMeaning($: cheerio.CheerioAPI, proverbText?: string): string | null {
    const content = $("#mw-content-text .mw-parser-output").first();
    let meaning: string | null = null;
    const label = this.normalizeLabel(proverbText || "");

    content.children().each((_, element) => {
      if (meaning !== null) {
        return false;
      }

      const current = $(element);
      const currentText = this.normalizeText(current.text());
      const currentHeadingText = this.normalizeText(current.find(".mw-headline, h2, h3, h4").first().text());
      const inlineMeaning = currentText.match(/(?:^|[\s;,.])artinya(?:\s+adalah)?\s*[:;,]?\s*(.+)$/i);

      if (inlineMeaning?.[1]) {
        const meaningParts = [this.normalizeMeaningText(inlineMeaning[1])];
        const nextMeaningItems = this.getNextMeaningItems($, current);

        meaning = [...meaningParts, ...nextMeaningItems].filter(Boolean).join("; ");
        return false;
      }

      const currentLabel = this.normalizeLabel(current.find("b").first().text() || label);
      const labeledMeaning = this.extractLabeledMeaning(currentText, currentLabel);

      if (labeledMeaning) {
        meaning = labeledMeaning;
        return false;
      }

      const nextMeaningItems = this.getNextMeaningItems($, current);

      if (nextMeaningItems.length > 0 && this.looksLikeProverbIntro(currentText, currentLabel)) {
        meaning = nextMeaningItems.join("; ");
        return false;
      }

      if (current.is("p, pre") && this.looksLikeStandaloneMeaning(currentText, label)) {
        meaning = currentText;
        return false;
      }

      const hasMeaningList =
        /^(arti|artinya)\s*:?\s*$/i.test(currentHeadingText || currentText) || /:\s*$/.test(currentText);

      if (!hasMeaningList) {
        return;
      }

      if (nextMeaningItems.length > 0) {
        meaning = nextMeaningItems.join("; ");
      }
    });

    return meaning || null;
  }

  private static getNextMeaningItems($: cheerio.CheerioAPI, current: cheerio.Cheerio<any>): string[] {
    return current
      .nextUntil("h2, h3, h4, .mw-heading")
      .filter("ol, ul")
      .first()
      .find("li")
      .map((_, item) => this.normalizeText($(item).text()))
      .get()
      .filter(Boolean);
  }

  private static extractLabeledMeaning(text: string, label: string): string | null {
    if (!text || !label) {
      return null;
    }

    const match = text.match(new RegExp(`^${this.escapeRegExp(label)}\\s*['"“”]?\\s*(?:[-.:;,]\\s*|\\s+)(.+)$`, "i"));
    const value = this.normalizeMeaningText(match?.[1] || "");

    if (value) {
      const explicitMeaning = value.match(
        /^(?:adalah\s+)?(?:peribahasa\s+yang\s+)?(?:memiliki\s+arti|berarti|bermakna|maksudnya|artinya(?:\s+adalah)?)\s*[:;,]?\s*(.+)$/i,
      );

      return this.normalizeMeaningText(explicitMeaning?.[1] || value) || null;
    }

    const separatedMeaning = text.match(/^(.+?)\s*[:]\s*(.+)$/);

    if (!separatedMeaning?.[1] || !separatedMeaning?.[2]) {
      return null;
    }

    const heading = this.compactForMatch(separatedMeaning[1]);
    const compactLabel = this.compactForMatch(label);

    if (!heading.includes(compactLabel) && !compactLabel.includes(heading)) {
      return null;
    }

    return this.normalizeMeaningText(separatedMeaning[2]) || null;
  }

  private static looksLikeProverbIntro(text: string, label: string): boolean {
    if (!text || !label) {
      return false;
    }

    const normalizedText = this.normalizeSearchText(text);
    const normalizedLabel = this.normalizeSearchText(label);

    return normalizedText === normalizedLabel || normalizedText.startsWith(`${normalizedLabel} `);
  }

  private static looksLikeStandaloneMeaning(text: string, label: string): boolean {
    if (!text || text.length < 3) {
      return false;
    }

    if (!label) {
      return true;
    }

    const normalizedText = this.normalizeSearchText(text);
    const normalizedLabel = this.normalizeSearchText(label);

    return normalizedText !== normalizedLabel && !normalizedText.startsWith(normalizedLabel);
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

  private static normalizeMeaningText(value: string): string {
    return this.normalizeText(value)
      .replace(/^[-:;,\s]+/, "")
      .trim();
  }

  private static normalizeLabel(value: string): string {
    return this.normalizeText(value).replace(/\s*[:;,]+$/, "");
  }

  private static compactForMatch(value: string): string {
    return this.normalizeSearchText(value).replace(/[^\p{L}\p{N}]+/gu, "");
  }

  private static escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export function parseProverbListHtml(html: string, sourceUrl: string): Proverb[] {
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
        const text = normalizeProverbText(firstLink.text() || $(li).text());

        if (!text) {
          return;
        }

        const key = text.toLocaleLowerCase("id-ID");

        if (seen.has(key)) {
          return;
        }

        seen.add(key);

        const href = firstLink.attr("href");
        const itemSourceUrl = href ? new URL(href, sourceUrl).toString() : undefined;
        const slug = proverbSlugFromUrl(itemSourceUrl) || proverbSlugFromText(text);

        items.push({
          text,
          letter,
          slug,
          sourceUrl: itemSourceUrl,
        });
      });
  });

  return items;
}

export function parseProverbDetailHtml(
  html: string,
  options: { fallback?: Proverb; sourceUrl: string },
): ProverbDetail {
  const $ = cheerio.load(html);
  const title = normalizeProverbText($("h1").first().text());
  const paragraphs = $("#mw-content-text .mw-parser-output > p")
    .map((_, paragraph) => normalizeProverbText($(paragraph).text()))
    .get()
    .filter(Boolean);

  const proverbText = options.fallback?.text || title;
  const text = proverbText || paragraphs[0] || title;
  const meaning = extractProverbMeaning($, proverbText);
  const slug = options.fallback?.slug || proverbSlugFromText(title || text);

  return {
    text,
    letter: options.fallback?.letter || text.charAt(0).toLocaleUpperCase("id-ID"),
    slug,
    sourceUrl: options.fallback?.sourceUrl || getProverbUrl(slug, options.sourceUrl),
    meaning,
  };
}

function extractProverbMeaning($: cheerio.CheerioAPI, proverbText?: string): string | null {
  const content = $("#mw-content-text .mw-parser-output").first();
  let meaning: string | null = null;
  const label = normalizeProverbLabel(proverbText || "");

  content.children().each((_, element) => {
    if (meaning !== null) {
      return false;
    }

    const current = $(element);
    const currentText = normalizeProverbText(current.text());
    const currentHeadingText = normalizeProverbText(current.find(".mw-headline, h2, h3, h4").first().text());
    const inlineMeaning = currentText.match(/(?:^|[\s;,.])artinya(?:\s+adalah)?\s*[:;,]?\s*(.+)$/i);

    if (inlineMeaning?.[1]) {
      const meaningParts = [normalizeProverbMeaningText(inlineMeaning[1])];
      const nextMeaningItems = getNextProverbMeaningItems($, current);

      meaning = [...meaningParts, ...nextMeaningItems].filter(Boolean).join("; ");
      return false;
    }

    const currentLabel = normalizeProverbLabel(current.find("b").first().text() || label);
    const labeledMeaning = extractLabeledProverbMeaning(currentText, currentLabel);

    if (labeledMeaning) {
      meaning = labeledMeaning;
      return false;
    }

    const nextMeaningItems = getNextProverbMeaningItems($, current);

    if (nextMeaningItems.length > 0 && looksLikeProverbIntro(currentText, currentLabel)) {
      meaning = nextMeaningItems.join("; ");
      return false;
    }

    if (current.is("p, pre") && looksLikeStandaloneProverbMeaning(currentText, label)) {
      meaning = currentText;
      return false;
    }

    const hasMeaningList =
      /^(arti|artinya)\s*:?\s*$/i.test(currentHeadingText || currentText) || /:\s*$/.test(currentText);

    if (!hasMeaningList) {
      return;
    }

    if (nextMeaningItems.length > 0) {
      meaning = nextMeaningItems.join("; ");
    }
  });

  return meaning || null;
}

function getNextProverbMeaningItems($: cheerio.CheerioAPI, current: cheerio.Cheerio<any>): string[] {
  return current
    .nextUntil("h2, h3, h4, .mw-heading")
    .filter("ol, ul")
    .first()
    .find("li")
    .map((_, item) => normalizeProverbText($(item).text()))
    .get()
    .filter(Boolean);
}

function extractLabeledProverbMeaning(text: string, label: string): string | null {
  if (!text || !label) {
    return null;
  }

  const match = text.match(new RegExp(`^${escapeProverbRegExp(label)}\\s*['"“”]?\\s*(?:[-.:;,]\\s*|\\s+)(.+)$`, "i"));
  const value = normalizeProverbMeaningText(match?.[1] || "");

  if (value) {
    const explicitMeaning = value.match(
      /^(?:adalah\s+)?(?:peribahasa\s+yang\s+)?(?:memiliki\s+arti|berarti|bermakna|maksudnya|artinya(?:\s+adalah)?)\s*[:;,]?\s*(.+)$/i,
    );

    return normalizeProverbMeaningText(explicitMeaning?.[1] || value) || null;
  }

  const separatedMeaning = text.match(/^(.+?)\s*[:]\s*(.+)$/);

  if (!separatedMeaning?.[1] || !separatedMeaning?.[2]) {
    return null;
  }

  const heading = compactProverbForMatch(separatedMeaning[1]);
  const compactLabel = compactProverbForMatch(label);

  if (!heading.includes(compactLabel) && !compactLabel.includes(heading)) {
    return null;
  }

  return normalizeProverbMeaningText(separatedMeaning[2]) || null;
}

function looksLikeProverbIntro(text: string, label: string): boolean {
  if (!text || !label) {
    return false;
  }

  const normalizedText = normalizeProverbSearchText(text);
  const normalizedLabel = normalizeProverbSearchText(label);

  return normalizedText === normalizedLabel || normalizedText.startsWith(`${normalizedLabel} `);
}

function looksLikeStandaloneProverbMeaning(text: string, label: string): boolean {
  if (!text || text.length < 3) {
    return false;
  }

  if (!label) {
    return true;
  }

  const normalizedText = normalizeProverbSearchText(text);
  const normalizedLabel = normalizeProverbSearchText(label);

  return normalizedText !== normalizedLabel && !normalizedText.startsWith(normalizedLabel);
}

function normalizeProverbText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^["'“”]+/, "")
    .replace(/["'“”\s.]+$/, "")
    .trim();
}

function normalizeProverbSearchText(value: string): string {
  return normalizeProverbText(value).toLocaleLowerCase("id-ID");
}

function normalizeProverbMeaningText(value: string): string {
  return normalizeProverbText(value)
    .replace(/^[-:;,\s]+/, "")
    .trim();
}

function normalizeProverbLabel(value: string): string {
  return normalizeProverbText(value).replace(/\s*[:;,]+$/, "");
}

function compactProverbForMatch(value: string): string {
  return normalizeProverbSearchText(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function escapeProverbRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeProverbSlug(value: string): string {
  return decodeURIComponent(value).trim().replace(/\s+/g, "_");
}

function proverbSlugFromText(value: string): string {
  return normalizeProverbText(value).replace(/\s+/g, "_");
}

function proverbSlugFromUrl(value?: string): string | null {
  if (!value) {
    return null;
  }

  const url = new URL(value);
  const title = url.searchParams.get("title");
  const slug = title || url.pathname.split("/").pop();

  return slug ? normalizeProverbSlug(slug) : null;
}

function getProverbUrl(slug: string, sourceUrl: string): string {
  return new URL(`/wiki/${encodeURIComponent(slug)}`, sourceUrl).toString();
}
