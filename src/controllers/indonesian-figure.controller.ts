import { Request, Response } from "express";
import { ApiResponse, IndonesianFigure, PaginatedIndonesianFigureList } from "../interfaces/kbbi.interface";
import { parsePaginationParams, parseRequiredQuery, parseSlugParam } from "../lib/request-validation";
import { IndonesianFigureService } from "../services/indonesian-figure.service";

export default class IndonesianFigureController {
  static async list(req: Request, res: Response<ApiResponse<PaginatedIndonesianFigureList>>): Promise<void> {
    const pagination = parsePaginationParams(req.query, { maxLimit: 50 });

    if (!pagination.success) {
      res.status(400).json(pagination.response);
      return;
    }

    const { page, limit } = pagination.data;
    const results = await IndonesianFigureService.list(page, limit);

    res.status(200).json({
      success: true,
      message: "Indonesian figure list fetched successfully",
      data: results,
    });
  }

  static async search(req: Request, res: Response<ApiResponse<PaginatedIndonesianFigureList>>): Promise<void> {
    const query = parseRequiredQuery(req.query.q, "q");

    if (!query.success) {
      res.status(400).json(query.response);
      return;
    }

    const pagination = parsePaginationParams(req.query, { maxLimit: 50 });

    if (!pagination.success) {
      res.status(400).json(pagination.response);
      return;
    }

    const { page, limit } = pagination.data;
    const results = await IndonesianFigureService.search(query.data, page, limit);

    res.status(200).json({
      success: true,
      message: "Indonesian figure search successful",
      data: results,
    });
  }

  static async detail(req: Request, res: Response<ApiResponse<IndonesianFigure>>): Promise<void> {
    const slug = parseSlugParam(req.params.slug);

    if (!slug.success) {
      res.status(400).json(slug.response);
      return;
    }

    const result = await IndonesianFigureService.detail(slug.data);

    if (!result) {
      res.status(404).json({
        success: false,
        message: "Indonesian figure not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Indonesian figure detail fetched successfully",
      data: result,
    });
  }
}
