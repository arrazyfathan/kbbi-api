import { Request, Response } from "express";
import { parsePaginationParams, parseRequiredQuery, parseSlugParam } from "../../lib/request-validation";
import { notFoundError } from "../../lib/api-error";
import type { ApiResponse } from "../../lib/api-response.types";
import { ProverbService } from "./proverb.service";
import type { PaginatedProverbList, ProverbDetail } from "./proverb.types";

export type ProverbLookupService = Pick<ProverbService, "list" | "search" | "detail">;

export default class ProverbController {
  constructor(private readonly proverbService: ProverbLookupService) {}

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

  detail = async (req: Request, res: Response<ApiResponse<ProverbDetail>>): Promise<void> => {
    const slug = parseSlugParam(req.params.slug);
    const result = await this.proverbService.detail(slug);

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
