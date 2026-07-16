import { Request, Response } from "express";
import { ApiResponse, PaginatedProverbList, ProverbDetail } from "../interfaces/kbbi.interface";
import { ProverbService } from "../services/proverb.service";

export default class ProverbController {
  static async list(req: Request, res: Response<ApiResponse<PaginatedProverbList>>): Promise<void> {
    const { page, limit } = ProverbController.getPaginationParams(req);
    const results = await ProverbService.list(page, limit);

    res.status(200).json({
      success: true,
      message: "Proverb list fetched successfully",
      data: results,
    });
  }

  static async search(req: Request, res: Response<ApiResponse<PaginatedProverbList>>): Promise<void> {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!query) {
      res.status(400).json({
        success: false,
        message: "Query parameter 'q' is required",
      });
      return;
    }

    const { page, limit } = ProverbController.getPaginationParams(req);
    const results = await ProverbService.search(query, page, limit);

    res.status(200).json({
      success: true,
      message: "Proverb search successful",
      data: results,
    });
  }

  static async detail(req: Request, res: Response<ApiResponse<ProverbDetail>>): Promise<void> {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    const result = await ProverbService.detail(slug);

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

  private static getPaginationParams(req: Request) {
    const page = Number.parseInt(String(req.query.page || "1"), 10);
    const limit = Number.parseInt(String(req.query.limit || "20"), 10);

    return { page, limit };
  }
}
