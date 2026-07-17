import { Request, Response } from "express";
import { ApiResponse, PaginatedProverbList, ProverbDetail } from "../interfaces/kbbi.interface";
import { parsePaginationParams, parseRequiredQuery, parseSlugParam } from "../lib/request-validation";
import { ProverbService } from "../services/proverb.service";

export default class ProverbController {
  static async list(req: Request, res: Response<ApiResponse<PaginatedProverbList>>): Promise<void> {
    const pagination = parsePaginationParams(req.query, { maxLimit: 100 });

    if (!pagination.success) {
      res.status(400).json(pagination.response);
      return;
    }

    const { page, limit } = pagination.data;
    const results = await ProverbService.list(page, limit);

    res.status(200).json({
      success: true,
      message: "Proverb list fetched successfully",
      data: results,
    });
  }

  static async search(req: Request, res: Response<ApiResponse<PaginatedProverbList>>): Promise<void> {
    const query = parseRequiredQuery(req.query.q, "q");

    if (!query.success) {
      res.status(400).json(query.response);
      return;
    }

    const pagination = parsePaginationParams(req.query, { maxLimit: 100 });

    if (!pagination.success) {
      res.status(400).json(pagination.response);
      return;
    }

    const { page, limit } = pagination.data;
    const results = await ProverbService.search(query.data, page, limit);

    res.status(200).json({
      success: true,
      message: "Proverb search successful",
      data: results,
    });
  }

  static async detail(req: Request, res: Response<ApiResponse<ProverbDetail>>): Promise<void> {
    const slug = parseSlugParam(req.params.slug);

    if (!slug.success) {
      res.status(400).json(slug.response);
      return;
    }

    const result = await ProverbService.detail(slug.data);

    if (!result) {
      res.status(404).json({
        success: false,
        message: "Proverb not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Proverb detail fetched successfully",
      data: result,
    });
  }
}
