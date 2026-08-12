import * as cheerio from "cheerio";
import type { Entry } from "./kbbi.types";

type KbbiWebIdRecord = {
  x?: number;
  d?: string;
};

const WORD_CLASS_LABELS: Record<string, string> = {
  a: "Adjektiva",
  adv: "Adverbia",
  cak: "Cakapan",
  interj: "Interjeksi",
  konj: "Konjungsi",
  n: "Nomina",
  num: "Numeralia",
  p: "Partikel",
  Pol: "Politik dan Pemerintahan",
  prep: "Preposisi",
  pron: "Pronomina",
  v: "Verba",
};

/**
 * Adapts kbbi.web.id's embedded lookup payload to the established API model.
 * The page also contains related-word suggestions, which are not direct entries.
 */
export function parseKbbiHtml(html: string, requestedWord?: string): Entry[] | null {
  const $ = cheerio.load(html);
  const payload = $("script#jsdata, textarea#jsdata").first().text().trim();

  if (!payload) {
    return null;
  }

  const records = parsePayload(payload);
  if (!records) {
    return null;
  }

  const directEntries = parseRecords(records, 1);
  const lookupWord = normalizeLookupWord(requestedWord || String($("#w").val() || ""));
  const entries =
    directEntries.length > 0
      ? directEntries
      : lookupWord
        ? parseRecords(records, 5).filter((entry) => normalizeLookupWord(entry.headword) === lookupWord)
        : [];

  const uniqueEntries = entries.filter(
    (entry, index) =>
      entries.findIndex(
        (candidate) =>
          candidate.headword === entry.headword &&
          JSON.stringify(candidate.definitions) === JSON.stringify(entry.definitions),
      ) === index,
  );

  return uniqueEntries.length > 0 ? uniqueEntries : null;
}

function parseRecords(records: KbbiWebIdRecord[], type: number): Entry[] {
  return records
    .filter((record) => record.x === type && typeof record.d === "string")
    .flatMap((record) => parseRecord(record.d!));
}

function parsePayload(payload: string): KbbiWebIdRecord[] | null {
  try {
    const value: unknown = JSON.parse(payload);
    return Array.isArray(value) ? (value as KbbiWebIdRecord[]) : null;
  } catch {
    return null;
  }
}

function parseRecord(html: string): Entry[] {
  return html
    .split(/<br\s*\/?\s*>\s*<br\s*\/?\s*>/i)
    .map((block) => parseEntryBlock(block))
    .filter((entry): entry is Entry => entry !== null);
}

function parseEntryBlock(html: string): Entry | null {
  const $ = cheerio.load(`<div id="entry">${html}</div>`);
  const entry = $("#entry");
  const headwordElement = entry.find("b").first();

  if (!headwordElement.length) {
    return null;
  }

  const headword = normalizeHeadword(headwordElement);
  const pronunciation = extractPronunciation(headwordElement);
  if (!headword) {
    return null;
  }

  headwordElement.remove();
  const wordClass = extractLeadingWordClass($, entry);
  const definitions = splitDefinitions(entry.html() || "").map((description) => ({ wordClass, description }));
  const uniqueDefinitions = definitions.filter(
    (definition, index) =>
      definition.description.length > 0 &&
      definitions.findIndex(
        (candidate) => candidate.wordClass === definition.wordClass && candidate.description === definition.description,
      ) === index,
  );

  return uniqueDefinitions.length > 0
    ? { headword: `${headword}${pronunciation ? ` ${pronunciation}` : ""}`, definitions: uniqueDefinitions }
    : null;
}

function normalizeHeadword(element: cheerio.Cheerio<any>): string {
  const clone = element.clone();
  clone.find("sup").remove();

  return normalizeText(clone.text()).replace(/·/g, ".");
}

function extractPronunciation(element: cheerio.Cheerio<any>): string {
  const nextSibling = element.get(0)?.nextSibling;
  const text = nextSibling?.type === "text" ? normalizeText(nextSibling.data || "") : "";

  return /^\/[^/]+\/$/.test(text) ? text : "";
}

function extractLeadingWordClass($: cheerio.CheerioAPI, entry: cheerio.Cheerio<any>): string {
  const codes: string[] = [];

  for (const node of entry.contents().toArray()) {
    if (node.type === "text") {
      const text = normalizeText(node.data || "");
      if (/^\/[^/]+\/$/.test(text)) {
        node.data = "";
        continue;
      }

      if (text.replace(/,/g, "")) {
        break;
      }
      continue;
    }

    const nodeElement = $(node);
    if (nodeElement.is("em")) {
      const code = normalizeText(nodeElement.text());
      if (code) {
        codes.push(formatWordClass(code));
      }
      nodeElement.remove();
      continue;
    }

    if (nodeElement.is("br")) {
      continue;
    }

    break;
  }

  return codes.join(" ");
}

function formatWordClass(code: string): string {
  const normalizedCode = code.replace(/[,:;]+$/, "");

  return normalizedCode
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part}[${WORD_CLASS_LABELS[part] || WORD_CLASS_LABELS[part.toLowerCase()] || part}]`)
    .join(" ");
}

function splitDefinitions(html: string): string[] {
  const numberedSense = /<b>\s*\d+\s*<\/b>/gi;
  const matches = [...html.matchAll(numberedSense)];
  const fragments =
    matches.length > 0
      ? matches.map((match, index) => html.slice((match.index || 0) + match[0].length, matches[index + 1]?.index))
      : [html];

  return fragments.map(normalizeDescription).filter(Boolean);
}

function normalizeDescription(html: string): string {
  const fragment = cheerio.load(`<div>${html}</div>`);
  fragment("script, style, .sumber").remove();
  fragment("br").replaceWith(" ");
  fragment("sup").remove();

  return normalizeText(fragment.root().text());
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLookupWord(value: string): string {
  return value.toLocaleLowerCase("id-ID").replace(/[^\p{L}\p{N}]/gu, "");
}
