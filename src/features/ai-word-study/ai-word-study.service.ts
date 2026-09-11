import {
  serviceUnavailableError,
  upstreamTimeoutError,
  upstreamUnavailableError,
  validationError,
} from "../../lib/api-error";
import logger from "../../lib/logger";
import { wordStudyContentSchema } from "./ai-word-study.schema";
import { AiProviderError } from "./openai-word-study.provider";
import type {
  WordStudyProvider,
  WordStudyProviderCatalog,
  WordStudyRequest,
  WordStudyResult,
} from "./ai-word-study.types";

export class AiWordStudyService {
  private readonly providers: readonly WordStudyProvider[];

  constructor(
    providers: WordStudyProvider | readonly WordStudyProvider[] = [],
    private readonly defaultProvider?: string,
  ) {
    this.providers = Array.isArray(providers) ? providers : [providers];
  }

  listProviders(): WordStudyProviderCatalog {
    return {
      defaultProvider: this.resolveDefaultProvider()?.name ?? null,
      providers: this.providers.map((provider) => ({
        id: provider.name,
        defaultModel: provider.defaultModel,
        models: [...provider.models],
      })),
    };
  }

  async generate(request: WordStudyRequest, requestId?: string): Promise<WordStudyResult> {
    if (this.providers.length === 0) {
      this.log(requestId, "configuration_unavailable", 0, false, false);
      throw serviceUnavailableError("AI word study is not configured");
    }

    const provider = this.resolveProvider(request.provider);
    const model = request.model ?? provider.defaultModel;
    if (!provider.models.includes(model)) {
      throw validationError("Invalid AI model selection", [
        { field: "model", location: "body", reason: `Model is not available for provider ${provider.name}` },
      ]);
    }

    const startedAt = Date.now();
    try {
      const rawContent = await provider.generate(request, model);
      const parsed = wordStudyContentSchema.safeParse(rawContent);
      if (!parsed.success || !hasValidRelatedWords(request.word, parsed.data?.relatedWords)) {
        throw new AiProviderError("malformed");
      }

      this.log(requestId, "success", Date.now() - startedAt, false, false, provider.name);
      return { ...parsed.data, provider: provider.name, model };
    } catch (error) {
      const failure = error instanceof AiProviderError ? error : new AiProviderError("unavailable");
      this.log(
        requestId,
        failure.kind,
        Date.now() - startedAt,
        failure.kind === "timeout",
        failure.kind === "rate_limit",
        provider.name,
      );

      if (failure.kind === "timeout") {
        throw upstreamTimeoutError("OpenAI request timed out");
      }
      throw upstreamUnavailableError("AI generation is temporarily unavailable");
    }
  }

  private resolveProvider(requestedProvider?: string): WordStudyProvider {
    const providerName = requestedProvider ?? this.resolveDefaultProvider()?.name;
    const provider = this.providers.find((candidate) => candidate.name === providerName);
    if (!provider) {
      throw validationError("Invalid AI provider selection", [
        { field: "provider", location: "body", reason: "Provider is not available" },
      ]);
    }
    return provider;
  }

  private resolveDefaultProvider(): WordStudyProvider | undefined {
    return this.providers.find((provider) => provider.name === this.defaultProvider) ?? this.providers[0];
  }

  private log(
    requestId: string | undefined,
    outcome: string,
    durationMs: number,
    timedOut: boolean,
    rateLimited: boolean,
    provider = this.resolveDefaultProvider()?.name ?? "unconfigured",
  ) {
    logger.info(
      {
        event: "ai_word_study",
        requestId,
        endpoint: "/api/v1/ai/word-study",
        outcome,
        upstreamStatusCategory: outcome,
        provider,
        durationMs,
        timedOut,
        rateLimited,
      },
      "AI word study request completed",
    );
  }
}

function normalizeIndonesian(value: string): string {
  return value.trim().toLocaleLowerCase("id-ID");
}

function hasValidRelatedWords(word: string, relatedWords: readonly string[] | undefined): boolean {
  if (!relatedWords) return false;
  const normalizedMainWord = normalizeIndonesian(word);
  const normalizedRelatedWords = relatedWords.map(normalizeIndonesian);
  return (
    !normalizedRelatedWords.includes(normalizedMainWord) &&
    new Set(normalizedRelatedWords).size === normalizedRelatedWords.length
  );
}
