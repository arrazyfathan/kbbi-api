import { Request, Response } from "express";
import { KbbiService } from "../services/kbbi.service";
import { ApiResponse, Entry } from "../interfaces/kbbi.interface";

export default class KbbiController {
  static async search(req: Request, res: Response<ApiResponse<Entry[]>>): Promise<void> {
    const { word } = req.params;

    if (!word || typeof word !== "string") {
      res.status(400).json({
        success: false,
        message: "Parameter 'word' is required and must be a string",
      });
      return;
    }

    const results = await KbbiService.search(word);

    if (!results) {
      res.status(404).json({
        success: false,
        message: "Word not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Search successful",
      data: results,
    });
  }
}
