import { NextFunction, Request, Response } from "express";
import { parseWordParam } from "../../lib/request-validation";
import logger from "../../lib/logger";
import { notFoundError } from "../../lib/api-error";
import type { ApiResponse } from "../../lib/api-response.types";
import { getRequestId } from "../../lib/request-id";
import { WordVisitService } from "../word-visits/word-visit.service";
import { AI_DEFINITION_NOTICE, AiDefinitionService } from "./ai-definition.service";
import { KbbiService } from "./kbbi.service";
import type { Entry, KbbiSearchResult } from "./kbbi.types";

export type KbbiSearchService = Pick<KbbiService, "search">;
export type WordVisitTrackingService = Pick<WordVisitService, "trackWordVisit">;
export type AiDefinitionGenerationService = Pick<AiDefinitionService, "generate" | "isConfigured">;

type SearchLookup = { word: string; normalizedWord: string; entries: Entry[] | null };

export default class KbbiController {
  constructor(
    private readonly kbbiService: KbbiSearchService,
    private readonly wordVisitService: WordVisitTrackingService,
    private readonly aiDefinitionService: AiDefinitionGenerationService = new AiDefinitionService(),
  ) {}

  lookup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { word, normalizedWord } = parseWordParam(req.params.word);
    const entries = await this.kbbiService.search(word);
    res.locals.searchLookup = { word, normalizedWord, entries } satisfies SearchLookup;
    next();
  };

  needsAiFallback = (_req: Request, res: Response): boolean => {
    const lookup = res.locals.searchLookup as SearchLookup;
    return !lookup.entries && this.aiDefinitionService.isConfigured();
  };

  search = async (req: Request, res: Response<ApiResponse<KbbiSearchResult>>): Promise<void> => {
    const { word, normalizedWord, entries } = res.locals.searchLookup as SearchLookup;
    const aiGenerated = !entries;
    const results = entries ?? (await this.aiDefinitionService.generate(word, getRequestId(req)));

    if (!results) {
      throw notFoundError("Word not found");
    }

    const visitorCount = await this.trackVisitorCount(normalizedWord, getVisitorId(req));

    res.status(200).json({
      success: true,
      message: "Search successful",
      data: {
        word: normalizedWord,
        visitorCount,
        entries: results,
        ...(aiGenerated ? { aiGenerated: true as const, notice: AI_DEFINITION_NOTICE } : {}),
      },
    });
  };

  private async trackVisitorCount(word: string, visitorId: string | undefined): Promise<number | null> {
    try {
      return await this.wordVisitService.trackWordVisit(word, visitorId);
    } catch (error) {
      logger.warn({ err: error, word }, "Failed to track word visit");
      return null;
    }
  }
}

function getVisitorId(req: Request): string | undefined {
  const header = req.headers["x-visitor-id"];
  return Array.isArray(header) ? header[0] : header;
}
