import { NextFunction, Request, Response } from "express";
import { notFoundError } from "../../lib/api-error";
import type { ApiResponse } from "../../lib/api-response.types";
import { getRequestId } from "../../lib/request-id";
import { parseOptionalLanguageQuery, parseWordParam } from "../../lib/request-validation";
import type { Entry } from "../kbbi/kbbi.types";
import type { TranslateService } from "./translate.service";
import type { TranslateResult } from "./translate.types";

export type TranslateSearchService = Pick<TranslateService, "translate" | "lookup" | "isAiConfigured">;

type TranslationLookup = { word: string; target: string; entries: Entry[] | null };

export default class TranslateController {
  constructor(private readonly translateService: TranslateSearchService) {}

  lookup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { word } = parseWordParam(req.params.word);
    const target = parseOptionalLanguageQuery(req.query.to, "to", "en");
    const entries = await this.translateService.lookup(word);
    res.locals.translationLookup = { word, target, entries } satisfies TranslationLookup;
    next();
  };

  needsAiFallback = (_req: Request, res: Response): boolean => {
    const lookup = res.locals.translationLookup as TranslationLookup;
    return !lookup.entries && this.translateService.isAiConfigured();
  };

  translate = async (req: Request, res: Response<ApiResponse<TranslateResult>>): Promise<void> => {
    const lookup = res.locals?.translationLookup as TranslationLookup | undefined;
    const { word } = lookup ?? parseWordParam(req.params.word);
    const target = lookup?.target ?? parseOptionalLanguageQuery(req.query.to, "to", "en");
    const result = lookup
      ? await this.translateService.translate(word, target, lookup.entries, getRequestId(req))
      : await this.translateService.translate(word, target);

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
