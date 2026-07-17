import { Request, Response } from "express";
import { ApiResponse, TopVisitedWordsResult } from "../interfaces/kbbi.interface";
import { normalizeTopWordsLimit, WordVisitService } from "../services/word-visit.service";

export default class WordController {
  static async topVisited(req: Request, res: Response<ApiResponse<TopVisitedWordsResult>>): Promise<void> {
    const limit = normalizeTopWordsLimit(Number.parseInt(String(req.query.limit || "10"), 10));
    const items = await WordVisitService.getTopVisitedWords(limit);

    res.status(200).json({
      success: true,
      message: "Top visited words fetched successfully",
      data: {
        count: items.length,
        items,
      },
    });
  }
}
