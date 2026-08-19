import config from "../../config";
import { getScraperHtml } from "../../lib/http-client";
import logger from "../../lib/logger";
import { TtlCache } from "../../lib/ttl-cache";
import type { KbbiService } from "../kbbi/kbbi.service";
import type { Entry } from "../kbbi/kbbi.types";
import { parseGoogleTranslateResponse } from "./google-translate.parser";
import type { GoogleTranslateSegment } from "./google-translate.parser";
import type { TranslateResult, TranslatedDefinition, TranslatedEntry } from "./translate.types";

type Clock = () => number;

const DEFAULT_SOURCE_LANGUAGE = "id";
const DEFAULT_TARGET_LANGUAGE = "en";
const CACHE_KEY_SEPARATOR = ":";

export class TranslateService {
  private readonly now: Clock;
  private readonly sourceUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly cache: TtlCache<string, TranslateResult>;

  constructor(
    private readonly kbbiService: Pick<KbbiService, "search">,
    options: { now?: Clock; sourceUrl?: string; timeoutMs?: number; cacheTtlMs?: number } = {},
  ) {
    this.now = options.now || Date.now;
    this.sourceUrl = options.sourceUrl ?? config.googleTranslateUrl;
    this.timeoutMs = options.timeoutMs ?? config.upstream.googleTranslateTimeoutMs;
    this.cacheTtlMs = options.cacheTtlMs ?? config.cache.translateTtlMs;
    this.cache = new TtlCache<string, TranslateResult>({
      ttlMs: this.cacheTtlMs,
      now: () => this.now(),
    });
  }

  /**
   * Translate every KBBI definition of a word from Indonesian to the target
   * language.
   * @param word The word to translate
   * @param target The target ISO 639-1/639-2 language code
   * @returns Translated entries or null when the word is not found in KBBI
   */
  async translate(word: string, target = DEFAULT_TARGET_LANGUAGE): Promise<TranslateResult | null> {
    const normalizedWord = normalizeWord(word);
    const entries = await this.kbbiService.search(normalizedWord);

    if (!entries) {
      return null;
    }

    const cacheKey = this.getCacheKey(normalizedWord, target);
    const cached = this.cache.get(cacheKey);
    this.logCache(cacheKey, Boolean(cached));

    if (cached) {
      return cached;
    }

    const translations = await this.translateAll(entries, target);
    const result = this.buildResult(normalizedWord, target, entries, translations);

    this.cache.set(cacheKey, result);

    return result;
  }

  private async translateAll(entries: Entry[], target: string): Promise<string[]> {
    const descriptions = entries.flatMap((entry) => entry.definitions.map((definition) => definition.description));

    if (descriptions.length === 0) {
      return [];
    }

    const batched = await this.translateBatch(descriptions, target);

    return batched.length === descriptions.length ? batched : this.translateIndividually(descriptions, target);
  }

  private async translateBatch(descriptions: string[], target: string): Promise<string[]> {
    try {
      const html = await this.fetchTranslation(target, descriptions.join("\n"));
      const segments = parseGoogleTranslateResponse(JSON.parse(html));

      return alignSegmentsToDescriptions(segments, descriptions) ?? [];
    } catch (error: any) {
      logger.warn(
        { err: error, event: "google_translate_batch_failed", count: descriptions.length },
        "Google Translate batch failed, falling back to per-definition requests",
      );

      return [];
    }
  }

  private async translateIndividually(descriptions: string[], target: string): Promise<string[]> {
    const settled = await Promise.allSettled(
      descriptions.map(async (description) => {
        const html = await this.fetchTranslation(target, description);
        const segments = parseGoogleTranslateResponse(JSON.parse(html));
        return joinTranslationSegments(segments);
      }),
    );

    const failures = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");

    if (failures.length === settled.length) {
      throw failures[0].reason;
    }

    return settled.map((result) => (result.status === "fulfilled" ? result.value : ""));
  }

  private async fetchTranslation(target: string, text: string): Promise<string> {
    return getScraperHtml(this.buildUrl(target, text), {
      timeoutMs: this.timeoutMs,
      upstream: "googletranslate",
    });
  }

  private buildUrl(target: string, text: string): string {
    const url = new URL(this.sourceUrl);
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", DEFAULT_SOURCE_LANGUAGE);
    url.searchParams.set("tl", target);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", text);

    return url.toString();
  }

  private buildResult(word: string, target: string, entries: Entry[], translations: string[]): TranslateResult {
    return {
      word,
      from: DEFAULT_SOURCE_LANGUAGE,
      to: target,
      entries: this.buildTranslatedEntries(entries, translations),
    };
  }

  private buildTranslatedEntries(entries: Entry[], translations: string[]): TranslatedEntry[] {
    let index = 0;

    return entries.map((entry) => ({
      headword: entry.headword,
      definitions: entry.definitions.map((definition): TranslatedDefinition => {
        const translation = translations[index] ?? "";
        index += 1;

        return {
          ...definition,
          translation,
        };
      }),
    }));
  }

  private getCacheKey(word: string, target: string): string {
    return `${word}${CACHE_KEY_SEPARATOR}${target}`;
  }

  private logCache(cacheKey: string, cacheHit: boolean): void {
    logger.info(
      {
        event: "cache_lookup",
        cacheName: "google_translate",
        cacheKey,
        cacheHit,
        ttlMs: this.cacheTtlMs,
      },
      cacheHit ? "Translate cache hit" : "Translate cache miss",
    );
  }
}

function normalizeWord(value: string): string {
  return value.trim().toLocaleLowerCase("id-ID");
}

function normalizeForAlignment(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Rebuilds each description's translation from the ordered response segments.
 * Segments carry the source fragment they were produced from, so long lines
 * that Google splits across several segments are stitched back together.
 * Returns null when the segments cannot be aligned exactly to the requested
 * descriptions, letting the caller fall back to per-definition requests.
 */
function alignSegmentsToDescriptions(segments: GoogleTranslateSegment[], descriptions: string[]): string[] | null {
  const translations = Array.from({ length: descriptions.length }, () => "");
  let descriptionIndex = 0;
  let accumulatedSource = "";
  let accumulatedTranslation = "";

  for (const segment of segments) {
    if (descriptionIndex >= descriptions.length) {
      return null;
    }

    accumulatedSource += segment.source;
    accumulatedTranslation += segment.translated;

    if (normalizeForAlignment(accumulatedSource) === normalizeForAlignment(descriptions[descriptionIndex])) {
      translations[descriptionIndex] = normalizeForAlignment(accumulatedTranslation);
      descriptionIndex += 1;
      accumulatedSource = "";
      accumulatedTranslation = "";
    }
  }

  return descriptionIndex === descriptions.length ? translations : null;
}

function joinTranslationSegments(segments: GoogleTranslateSegment[]): string {
  return normalizeForAlignment(segments.map((segment) => segment.translated).join(""));
}
