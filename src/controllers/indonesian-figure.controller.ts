import { Request, Response } from "express";
import { ApiResponse, IndonesianFigure, PaginatedIndonesianFigureList } from "../interfaces/kbbi.interface";
import {
  parseBooleanQuery,
  parsePaginationParams,
  parseRequiredQuery,
  parseSlugParam,
} from "../lib/request-validation";
import { notFoundError } from "../lib/api-error";
import { IndonesianFigureService } from "../services/indonesian-figure.service";

export type IndonesianFigureLookupService = Pick<IndonesianFigureService, "list" | "search" | "detail">;

export default class IndonesianFigureController {
  constructor(private readonly indonesianFigureService: IndonesianFigureLookupService) {}

  list = async (req: Request, res: Response<ApiResponse<PaginatedIndonesianFigureList>>): Promise<void> => {
    const pagination = parsePaginationParams(req.query, { maxLimit: 50 });
    const includeDetails = parseBooleanQuery(req.query.includeDetails, "includeDetails");
    const { page, limit } = pagination;
    const results = await this.indonesianFigureService.list(page, limit, { includeDetails });

    res.status(200).json({
      success: true,
      message: "Indonesian figure list fetched successfully",
      data: results,
    });
  };

  search = async (req: Request, res: Response<ApiResponse<PaginatedIndonesianFigureList>>): Promise<void> => {
    const query = parseRequiredQuery(req.query.q, "q");
    const pagination = parsePaginationParams(req.query, { maxLimit: 50 });
    const includeDetails = parseBooleanQuery(req.query.includeDetails, "includeDetails");

    const { page, limit } = pagination;
    const results = await this.indonesianFigureService.search(query, page, limit, { includeDetails });

    res.status(200).json({
      success: true,
      message: "Indonesian figure search successful",
      data: results,
    });
  };

  detail = async (req: Request, res: Response<ApiResponse<IndonesianFigure>>): Promise<void> => {
    const slug = parseSlugParam(req.params.slug);
    const result = await this.indonesianFigureService.detail(slug);

    if (!result) {
      throw notFoundError("Indonesian figure not found");
    }

    res.status(200).json({
      success: true,
      message: "Indonesian figure detail fetched successfully",
      data: result,
    });
  };
}
