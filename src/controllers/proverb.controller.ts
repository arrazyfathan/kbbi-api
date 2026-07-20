import { Request, Response } from "express";
import { ApiResponse, PaginatedProverbList, ProverbDetail } from "../interfaces/kbbi.interface";
import { parsePaginationParams, parseRequiredQuery, parseSlugParam } from "../lib/request-validation";
import { notFoundError } from "../lib/api-error";
import { ProverbService } from "../services/proverb.service";

export default class ProverbController {
  static async list(req: Request, res: Response<ApiResponse<PaginatedProverbList>>): Promise<void> {
    const pagination = parsePaginationParams(req.query, { maxLimit: 100 });
    const { page, limit } = pagination;
    const results = await ProverbService.list(page, limit);

    res.status(200).json({
      success: true,
      message: "Proverb list fetched successfully",
      data: results,
    });
  }

  static async search(req: Request, res: Response<ApiResponse<PaginatedProverbList>>): Promise<void> {
    const query = parseRequiredQuery(req.query.q, "q");
    const pagination = parsePaginationParams(req.query, { maxLimit: 100 });

    const { page, limit } = pagination;
    const results = await ProverbService.search(query, page, limit);

    res.status(200).json({
      success: true,
      message: "Proverb search successful",
      data: results,
    });
  }

  static async detail(req: Request, res: Response<ApiResponse<ProverbDetail>>): Promise<void> {
    const slug = parseSlugParam(req.params.slug);
    const result = await ProverbService.detail(slug);

    if (!result) {
      throw notFoundError("Proverb not found");
    }

    res.status(200).json({
      success: true,
      message: "Proverb detail fetched successfully",
      data: result,
    });
  }
}
