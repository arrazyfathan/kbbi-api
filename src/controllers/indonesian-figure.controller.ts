import { Request, Response } from "express";
import { ApiResponse, IndonesianFigure, PaginatedIndonesianFigureList } from "../interfaces/kbbi.interface";
import { IndonesianFigureService } from "../services/indonesian-figure.service";

export default class IndonesianFigureController {
  static async list(req: Request, res: Response<ApiResponse<PaginatedIndonesianFigureList>>) {
    try {
      const { page, limit } = IndonesianFigureController.getPaginationParams(req);
      const results = await IndonesianFigureService.list(page, limit);

      res.status(200).json({
        success: true,
        message: "Indonesian figure list fetched successfully",
        data: results,
      });
    } catch (error: any) {
      console.error(`Error fetching Indonesian figure list: ${error.message}`);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  static async search(req: Request, res: Response<ApiResponse<PaginatedIndonesianFigureList>>) {
    try {
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

      if (!query) {
        res.status(400).json({
          success: false,
          message: "Query parameter 'q' is required",
        });
        return;
      }

      const { page, limit } = IndonesianFigureController.getPaginationParams(req);
      const results = await IndonesianFigureService.search(query, page, limit);

      res.status(200).json({
        success: true,
        message: "Indonesian figure search successful",
        data: results,
      });
    } catch (error: any) {
      console.error(`Error searching Indonesian figures: ${error.message}`);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  static async detail(req: Request, res: Response<ApiResponse<IndonesianFigure>>) {
    try {
      const slug = typeof req.params.slug === "string" ? req.params.slug : "";
      const result = await IndonesianFigureService.detail(slug);

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
    } catch (error: any) {
      console.error(`Error fetching Indonesian figure detail: ${error.message}`);
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
