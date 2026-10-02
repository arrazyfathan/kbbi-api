import { NextFunction, Request, Response } from "express";
import { parsePaginationParams, parseRequiredQuery, parseSlugParam } from "../../lib/request-validation";
import { notFoundError } from "../../lib/api-error";
import type { ApiResponse } from "../../lib/api-response.types";
import { ProverbService } from "./proverb.service";
import type { PaginatedProverbList, ProverbDetail } from "./proverb.types";
import { AiProverbMeaningService, AI_PROVERB_NOTICE } from "./ai-proverb-meaning.service";
import { getRequestId } from "../../lib/request-id";
import logger from "../../lib/logger";

export type ProverbLookupService = Pick<
  ProverbService,
  "list" | "search" | "detail" | "lookupDetail" | "cacheAiDetail"
>;

type PreparedDetail = Awaited<ReturnType<ProverbService["lookupDetail"]>> & { slug: string };

export default class ProverbController {
  constructor(
    private readonly proverbService: ProverbLookupService,
    private readonly aiProverbMeaningService: Pick<
      AiProverbMeaningService,
      "generate" | "isConfigured"
    > = new AiProverbMeaningService(),
  ) {}

  list = async (req: Request, res: Response<ApiResponse<PaginatedProverbList>>): Promise<void> => {
    const pagination = parsePaginationParams(req.query, { maxLimit: 100 });
    const { page, limit } = pagination;
    const results = await this.proverbService.list(page, limit);

    res.status(200).json({
      success: true,
      message: "Proverb list fetched successfully",
      data: results,
    });
  };

  search = async (req: Request, res: Response<ApiResponse<PaginatedProverbList>>): Promise<void> => {
    const query = parseRequiredQuery(req.query.q, "q");
    const pagination = parsePaginationParams(req.query, { maxLimit: 100 });

    const { page, limit } = pagination;
    const results = await this.proverbService.search(query, page, limit);

    res.status(200).json({
      success: true,
      message: "Proverb search successful",
      data: results,
    });
  };

  lookupDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const slug = parseSlugParam(req.params.slug);
    res.locals.preparedProverbDetail = {
      ...(await this.proverbService.lookupDetail(slug)),
      slug,
    } satisfies PreparedDetail;
    next();
  };

  needsAiFallback = (_req: Request, res: Response): boolean => {
    const lookup = res.locals.preparedProverbDetail as PreparedDetail;
    return Boolean(
      lookup.knownProverb && (!lookup.detail || !lookup.detail.meaning) && this.aiProverbMeaningService.isConfigured(),
    );
  };

  detail = async (req: Request, res: Response<ApiResponse<ProverbDetail>>): Promise<void> => {
    const lookup = res.locals.preparedProverbDetail as PreparedDetail;
    let result = lookup.detail;

    if (lookup.knownProverb && (!result || !result.meaning)) {
      const meaning = await this.aiProverbMeaningService.generate(lookup.knownProverb.text, getRequestId(req));
      if (meaning) {
        result = {
          ...(result || lookup.knownProverb),
          meaning,
          aiGenerated: true,
          notice: AI_PROVERB_NOTICE,
        };
        try {
          await this.proverbService.cacheAiDetail(lookup.slug, result);
        } catch (error) {
          logger.warn({ err: error, slug: lookup.slug }, "Failed to cache AI proverb meaning");
        }
      }
    }

    if (!result) {
      throw notFoundError("Proverb not found");
    }

    res.status(200).json({
      success: true,
      message: "Proverb detail fetched successfully",
      data: result,
    });
  };
}
