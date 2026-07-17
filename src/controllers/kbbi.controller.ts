import { Request, Response } from "express";
import { KbbiService } from "../services/kbbi.service";
import { ApiResponse, KbbiSearchResult } from "../interfaces/kbbi.interface";
import { WordVisitService } from "../services/word-visit.service";
import { parseWordParam } from "../lib/request-validation";
import logger from "../lib/logger";

export default class KbbiController {
  static async search(req: Request, res: Response<ApiResponse<KbbiSearchResult>>): Promise<void> {
    const word = parseWordParam(req.params.word);

    if (!word.success) {
      res.status(400).json(word.response);
      return;
    }

    const { normalizedWord } = word.data;
    const results = await KbbiService.search(word.data.word);

    if (!results) {
      res.status(404).json({
        success: false,
        message: "Word not found",
      });
      return;
    }

    const visitorCount = await trackVisitorCount(normalizedWord, getVisitorId(req));

    res.status(200).json({
      success: true,
      message: "Search successful",
      data: {
        word: normalizedWord,
        visitorCount,
        entries: results,
      },
    });
  }
}

async function trackVisitorCount(word: string, visitorId: string | undefined): Promise<number | null> {
  try {
    return await WordVisitService.trackWordVisit(word, visitorId);
  } catch (error) {
    logger.warn({ err: error, word }, "Failed to track word visit");
    return null;
  }
}

function getVisitorId(req: Request): string | undefined {
  const header = req.headers["x-visitor-id"];
  return Array.isArray(header) ? header[0] : header;
}
