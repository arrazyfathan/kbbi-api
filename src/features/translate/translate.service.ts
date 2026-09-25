import config from "../../config";
import { getScraperHtml, isUpstreamHttpError } from "../../lib/http-client";
import logger from "../../lib/logger";
import { TtlCache } from "../../lib/ttl-cache";
import { upstreamUnavailableError } from "../../lib/api-error";
import { AI_DEFINITION_NOTICE } from "../kbbi/ai-definition.service";
import type { AiDefinitionService } from "../kbbi/ai-definition.service";
import type { KbbiService } from "../kbbi/kbbi.service";
import type { Entry } from "../kbbi/kbbi.types";
import type { AiTranslationProvider } from "./ai-translate.client";
import { parseGoogleTranslateResponse } from "./google-translate.parser";
import type { GoogleTranslateSegment } from "./google-translate.parser";
import { LaraTranslateClient } from "./lara-translate.client";
import type { LaraTranslationProvider } from "./lara-translate.client";
import type { TranslateResult, TranslatedDefinition, TranslatedEntry, TranslationProvider } from "./translate.types";

type Clock = () => number;

interface WordAndDefinitionTranslations {
  word: string;
  definitions: string[];
  provider: TranslationProvider;
}

const DEFAULT_SOURCE_LANGUAGE = "id";
const DEFAULT_TARGET_LANGUAGE = "en";
const CACHE_KEY_SEPARATOR = ":";

export class TranslateService {
  private readonly now: Clock;
  private readonly sourceUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly cache: TtlCache<string, TranslateResult>;
  private readonly laraProvider?: LaraTranslationProvider;
  private readonly aiDefinitionService?: Pick<AiDefinitionService, "generate" | "isConfigured">;
  private readonly aiTranslationProvider?: AiTranslationProvider;

  constructor(
    private readonly kbbiService: Pick<KbbiService, "search">,
    options: {
      now?: Clock;
      sourceUrl?: string;
      timeoutMs?: number;
      cacheTtlMs?: number;
      laraProvider?: LaraTranslationProvider | null;
      aiDefinitionService?: Pick<AiDefinitionService, "generate" | "isConfigured">;
      aiTranslationProvider?: AiTranslationProvider;
    } = {},
  ) {
    this.now = options.now || Date.now;
    this.sourceUrl = options.sourceUrl ?? config.googleTranslateUrl;
    this.timeoutMs = options.timeoutMs ?? config.upstream.googleTranslateTimeoutMs;
    this.cacheTtlMs = options.cacheTtlMs ?? config.cache.translateTtlMs;
    this.laraProvider =
      options.laraProvider === undefined ? createConfiguredLaraProvider() : (options.laraProvider ?? undefined);
    this.aiDefinitionService = options.aiDefinitionService;
    this.aiTranslationProvider = options.aiTranslationProvider;
    this.cache = new TtlCache<string, TranslateResult>({
      ttlMs: this.cacheTtlMs,
      now: () => this.now(),
    });
  }

  /**
   * Translate a word and every one of its definitions from Indonesian to the target language.
   * @param word The word to translate
   * @param target The target ISO 639-1/639-2 language code
   * @returns Translated word and entries or null when no definition is available
   */
  async translate(
    word: string,
    target = DEFAULT_TARGET_LANGUAGE,
    preloadedEntries?: Entry[] | null,
    requestId?: string,
  ): Promise<TranslateResult | null> {
    const normalizedWord = normalizeWord(word);
    const kbbiEntries = preloadedEntries === undefined ? await this.lookup(normalizedWord) : preloadedEntries;
    const aiGenerated = !kbbiEntries;

    const cacheKey = this.getCacheKey(normalizedWord, target);
    const cached = this.cache.get(cacheKey);
    const usableCache = cached && Boolean(cached.aiGenerated) === aiGenerated ? cached : undefined;
    this.logCache(cacheKey, Boolean(usableCache));

    if (usableCache) {
      return usableCache;
    }

    const entries = kbbiEntries ?? (await this.aiDefinitionService?.generate(normalizedWord, requestId));
    if (!entries) return null;

    const translations = await this.translateAll(normalizedWord, entries, target, aiGenerated);
    const result = this.buildResult(normalizedWord, target, entries, translations, aiGenerated);

    this.cache.set(cacheKey, result);

    return result;
  }

  lookup(word: string): Promise<Entry[] | null> {
    return this.kbbiService.search(normalizeWord(word));
  }

  isAiConfigured(): boolean {
    return this.aiDefinitionService?.isConfigured() ?? false;
  }

  private async translateAll(
    word: string,
    entries: Entry[],
    target: string,
    aiGenerated: boolean,
  ): Promise<WordAndDefinitionTranslations> {
    const descriptions = entries.flatMap((entry) => entry.definitions.map((definition) => definition.description));
    const texts = [word, ...descriptions];

    try {
      return await this.translateWithGoogle(word, descriptions, texts, target);
    } catch (googleError) {
      if (this.laraProvider) {
        logger.warn(
          { err: googleError, event: "google_translate_failed", count: texts.length },
          "Google Translate failed, falling back to Lara Translate",
        );

        try {
          const translations = await this.laraProvider.translate(texts, target);

          return { word: translations[0] ?? word, definitions: translations.slice(1), provider: "lara" };
        } catch (laraError) {
          logger.warn(
            { err: laraError, event: "lara_translate_failed", count: texts.length },
            "Lara Translate fallback failed",
          );
          return this.translateWithAiOrThrow(texts, target, aiGenerated, laraError);
        }
      }

      return this.translateWithAiOrThrow(texts, target, aiGenerated, googleError);
    }
  }

  private async translateWithAiOrThrow(
    texts: string[],
    target: string,
    aiGenerated: boolean,
    previousError: unknown,
  ): Promise<WordAndDefinitionTranslations> {
    if (!aiGenerated || !this.aiTranslationProvider) throw previousError;

    logger.info({ event: "ai_translate_fallback", count: texts.length }, "Trying AI translation fallback");
    const translations = await this.aiTranslationProvider.translate(texts, target);
    if (translations.length !== texts.length || translations.some((translation) => !translation.trim())) {
      throw upstreamUnavailableError("AI translation returned an invalid result");
    }

    return { word: translations[0], definitions: translations.slice(1), provider: "ai" };
  }

  private async translateWithGoogle(
    word: string,
    descriptions: string[],
    texts: string[],
    target: string,
  ): Promise<WordAndDefinitionTranslations> {
    const batched = await this.translateBatch(texts, target);

    if (batched.length === texts.length) {
      return { word: batched[0] ?? word, definitions: batched.slice(1), provider: "google" };
    }

    return this.translateIndividually(word, descriptions, target);
  }

  private async translateBatch(texts: string[], target: string): Promise<string[]> {
    try {
      const html = await this.fetchTranslation(target, texts.join("\n"));
      const segments = parseGoogleTranslateResponse(JSON.parse(html));

      return alignSegmentsToDescriptions(segments, texts) ?? [];
    } catch (error: any) {
      const upstreamFailed = isUpstreamHttpError(error);

      logger.warn(
        { err: error, event: "google_translate_batch_failed", count: texts.length },
        upstreamFailed
          ? "Google Translate batch request failed"
          : "Google Translate batch failed, falling back to per-definition requests",
      );

      if (upstreamFailed) {
        throw error;
      }

      return [];
    }
  }

  private async translateIndividually(
    word: string,
    descriptions: string[],
    target: string,
  ): Promise<WordAndDefinitionTranslations> {
    const settled = await Promise.allSettled(
      [word, ...descriptions].map(async (text) => {
        const html = await this.fetchTranslation(target, text);
        const segments = parseGoogleTranslateResponse(JSON.parse(html));
        return joinTranslationSegments(segments);
      }),
    );

    const failures = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");

    if (failures.length === settled.length) {
      throw failures[0].reason;
    }

    const values = settled.map((result) => (result.status === "fulfilled" ? result.value : ""));

    return { word: values[0] ?? word, definitions: values.slice(1), provider: "google" };
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

  private buildResult(
    word: string,
    target: string,
    entries: Entry[],
    translations: WordAndDefinitionTranslations,
    aiGenerated: boolean,
  ): TranslateResult {
    return {
      word,
      translation: translations.word,
      from: DEFAULT_SOURCE_LANGUAGE,
      to: target,
      provider: translations.provider,
      entries: this.buildTranslatedEntries(entries, translations.definitions),
      ...(aiGenerated ? { aiGenerated: true as const, notice: AI_DEFINITION_NOTICE } : {}),
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
        cacheName: "translate",
        cacheKey,
        cacheHit,
        ttlMs: this.cacheTtlMs,
      },
      cacheHit ? "Translate cache hit" : "Translate cache miss",
    );
  }
}

function createConfiguredLaraProvider(): LaraTranslationProvider | undefined {
  if (!config.isLaraConfigured || !config.laraAccessKeyId || !config.laraAccessKeySecret) {
    return undefined;
  }

  return new LaraTranslateClient(
    config.laraAccessKeyId,
    config.laraAccessKeySecret,
    config.upstream.laraTranslateTimeoutMs,
  );
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
