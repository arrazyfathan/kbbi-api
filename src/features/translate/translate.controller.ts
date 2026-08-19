import { Request, Response } from "express";
import { notFoundError } from "../../lib/api-error";
import type { ApiResponse } from "../../lib/api-response.types";
import { parseOptionalLanguageQuery, parseWordParam } from "../../lib/request-validation";
import type { TranslateService } from "./translate.service";
import type { TranslateResult } from "./translate.types";

export type TranslateSearchService = Pick<TranslateService, "translate">;

export default class TranslateController {
  constructor(private readonly translateService: TranslateSearchService) {}

  translate = async (req: Request, res: Response<ApiResponse<TranslateResult>>): Promise<void> => {
    const { word } = parseWordParam(req.params.word);
    const target = parseOptionalLanguageQuery(req.query.to, "to", "en");
    const result = await this.translateService.translate(word, target);

    if (!result) {
      throw notFoundError("Word not found");
    }

    res.status(200).json({
      success: true,
      message: "Translation successful",
      data: result,
    });
  };
}
