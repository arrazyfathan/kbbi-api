import { Request, Response } from "express";
import { ApiResponse, PaginatedProverbList, ProverbDetail } from "../interfaces/kbbi.interface";
import { ProverbService } from "../services/proverb.service";

export default class ProverbController {
  static async list(req: Request, res: Response<ApiResponse<PaginatedProverbList>>) {
    try {
      const { page, limit } = ProverbController.getPaginationParams(req);
      const results = await ProverbService.list(page, limit);

      res.status(200).json({
        success: true,
        message: "Proverb list fetched successfully",
        data: results,
      });
    } catch (error: any) {
      console.error(`Error fetching proverb list: ${error.message}`);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  static async search(req: Request, res: Response<ApiResponse<PaginatedProverbList>>) {
    try {
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
    } catch (error: any) {
      console.error(`Error searching proverb list: ${error.message}`);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  static async detail(req: Request, res: Response<ApiResponse<ProverbDetail>>) {
    try {
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
    } catch (error: any) {
      console.error(`Error fetching proverb detail: ${error.message}`);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  private static getPaginationParams(req: Request) {
    const page = Number.parseInt(String(req.query.page || "1"), 10);
    const limit = Number.parseInt(String(req.query.limit || "20"), 10);

    return { page, limit };
  }
}
