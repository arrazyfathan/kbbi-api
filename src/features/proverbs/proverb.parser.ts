import * as cheerio from "cheerio";
import type { Proverb, ProverbDetail } from "./proverb.types";

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

export function normalizeProverbSearchText(value: string): string {
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

export function normalizeProverbSlug(value: string): string {
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

export function getProverbUrl(slug: string, sourceUrl: string): string {
  return new URL(`/wiki/${encodeURIComponent(slug)}`, sourceUrl).toString();
}
