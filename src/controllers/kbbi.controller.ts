import { Request, Response } from "express";
import { KbbiService } from "../services/kbbi.service";
import { ApiResponse, KbbiSearchResult } from "../interfaces/kbbi.interface";
import { WordVisitService } from "../services/word-visit.service";
import { parseWordParam } from "../lib/request-validation";
import logger from "../lib/logger";
import { notFoundError } from "../lib/api-error";

export type KbbiSearchService = Pick<KbbiService, "search">;
export type WordVisitTrackingService = Pick<WordVisitService, "trackWordVisit">;

export default class KbbiController {
  constructor(
    private readonly kbbiService: KbbiSearchService,
    private readonly wordVisitService: WordVisitTrackingService,
  ) {}

  search = async (req: Request, res: Response<ApiResponse<KbbiSearchResult>>): Promise<void> => {
    const word = parseWordParam(req.params.word);
    const { normalizedWord } = word;
    const results = await this.kbbiService.search(word.word);

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
