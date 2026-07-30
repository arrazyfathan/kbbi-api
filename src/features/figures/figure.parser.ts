import * as cheerio from "cheerio";
import type { IndonesianFigure, IndonesianFigureSummary } from "./figure.types";

export function parseIndonesianFigureCategoryHtml(
  html: string,
  currentUrl: string,
): { items: IndonesianFigureSummary[]; nextUrl: string | null } {
  const $ = cheerio.load(html);
  const items: IndonesianFigureSummary[] = [];

  $("#mw-pages .mw-category a").each((_, link) => {
    const name = normalizeFigureText($(link).text()) || null;
    const href = $(link).attr("href");
    const sourceUrl = href ? new URL(href, currentUrl).toString() : "";
    const slug = figureSlugFromUrl(sourceUrl);

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

export function parseIndonesianFigureDetailHtml(
  html: string,
  options: { fallback?: IndonesianFigureSummary; sourceUrl: string },
): IndonesianFigure {
  const $ = cheerio.load(html);
  const title = normalizeFigureText($("h1").first().text());
  const name = options.fallback?.name || title || null;
  const slug = options.fallback?.slug || figureSlugFromText(title || name || "");
  const sourceUrl = options.fallback?.sourceUrl || getFigureUrl(slug, options.sourceUrl);
  const description = extractFigureDescription($);
  const photo = extractFigurePhoto($, sourceUrl);
  const quotes = extractFigureQuotes($);

  return {
    name,
    slug,
    sourceUrl,
    photo,
    description,
    quotes: quotes.length > 0 ? quotes : null,
  };
}

function extractFigureDescription($: cheerio.CheerioAPI): string | null {
  const paragraphs = $("#mw-content-text .mw-parser-output > p")
    .map((_, paragraph) => normalizeFigureText($(paragraph).text()))
    .get()
    .filter(Boolean);

  return paragraphs[0] || null;
}

function extractFigurePhoto($: cheerio.CheerioAPI, sourceUrl: string): string | null {
  const ignoredImagePattern = /(Commons-logo|Wikipedia-logo|Wikisource-logo|Wikiquote-logo|OOjs_UI_icon)/i;
  let photo: string | null = null;

  $("#mw-content-text .mw-parser-output figure img, #mw-content-text .mw-parser-output .infobox img").each(
    (_, image) => {
      if (photo) {
        return false;
      }

      const src = $(image).attr("src");

      if (!src || ignoredImagePattern.test(src)) {
        return;
      }

      photo = new URL(src, sourceUrl).toString();
    },
  );

  return photo;
}

function extractFigureQuotes($: cheerio.CheerioAPI): string[] {
  const content = $("#mw-content-text .mw-parser-output").first();
  const quotes: string[] = [];
  const seen = new Set<string>();
  let inQuoteSection = false;

  content.children().each((_, element) => {
    const current = $(element);
    const heading = normalizeFigureSearchText(current.find("h2, h3, .mw-headline").first().text() || current.text());

    if (current.is("h2, h3, .mw-heading")) {
      inQuoteSection = /^(kutipan|ucapan|perkataan|quotes?)/i.test(heading);
      return;
    }

    if (!inQuoteSection || !current.is("ul, ol")) {
      return;
    }

    current.children("li").each((_, item) => {
      const quote = normalizeFigureQuoteText(textWithoutNestedFigureLists($, $(item)));
      const key = normalizeFigureSearchText(quote);

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

  content
    .children("ul, ol")
    .children("li")
    .each((_, item) => {
      const quote = normalizeFigureQuoteText(textWithoutNestedFigureLists($, $(item)));
      const key = normalizeFigureSearchText(quote);

      if (!quote || seen.has(key)) {
        return;
      }

      seen.add(key);
      quotes.push(quote);
    });

  return quotes;
}

function textWithoutNestedFigureLists($: cheerio.CheerioAPI, item: cheerio.Cheerio<any>): string {
  const clone = item.clone();
  clone.find("ul, ol, table, style, script").remove();

  return normalizeFigureText(clone.text());
}

function normalizeFigureText(value: string): string {
  return value
    .replace(/\[\s*sunting(?: sumber)?\s*\]/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^["'“”]+/, "")
    .replace(/["'“”\s]+$/, "")
    .trim();
}

function normalizeFigureQuoteText(value: string): string {
  return normalizeFigureText(value)
    .replace(/[.。]\s*$/, "")
    .trim();
}

export function normalizeFigureSearchText(value: string): string {
  return normalizeFigureText(value).toLocaleLowerCase("id-ID");
}

export function normalizeFigureSlug(value: string): string {
  return decodeURIComponent(value).trim().replace(/\s+/g, "_");
}

function figureSlugFromText(value: string): string {
  return normalizeFigureText(value).replace(/\s+/g, "_");
}

function figureSlugFromUrl(value?: string): string | null {
  if (!value) {
    return null;
  }

  const url = new URL(value);
  const title = url.searchParams.get("title");
  const slug = title || url.pathname.split("/").pop();

  return slug ? normalizeFigureSlug(slug) : null;
}

export function getFigureUrl(slug: string, sourceUrl: string): string {
  return new URL(`/wiki/${encodeURIComponent(slug)}`, sourceUrl).toString();
}
