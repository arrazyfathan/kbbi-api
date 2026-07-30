import { Request, Response } from "express";
import type { ApiResponse } from "../../lib/api-response.types";
import { normalizeTopWordsLimit, WordVisitService } from "./word-visit.service";
import type { TopVisitedWordsResult } from "./word-visit.types";

export type TopVisitedWordsService = Pick<WordVisitService, "getTopVisitedWords">;

export default class WordController {
  constructor(private readonly wordVisitService: TopVisitedWordsService) {}

  topVisited = async (req: Request, res: Response<ApiResponse<TopVisitedWordsResult>>): Promise<void> => {
    const limit = normalizeTopWordsLimit(Number.parseInt(String(req.query.limit || "10"), 10));
    const items = await this.wordVisitService.getTopVisitedWords(limit);

    res.status(200).json({
      success: true,
      message: "Top visited words fetched successfully",
      data: {
        count: items.length,
        items,
      },
    });
  };
}
