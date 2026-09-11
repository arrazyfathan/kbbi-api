import { Request, Response } from "express";
import type { ApiResponse } from "../../lib/api-response.types";
import { getRequestId } from "../../lib/request-id";
import { parseWordStudyRequest } from "./ai-word-study.schema";
import type { AiWordStudyService } from "./ai-word-study.service";
import type { WordStudyProviderCatalog, WordStudyResult } from "./ai-word-study.types";

export type WordStudyGenerationService = Pick<AiWordStudyService, "generate" | "listProviders">;

export default class AiWordStudyController {
  constructor(private readonly service: WordStudyGenerationService) {}

  generate = async (req: Request, res: Response<ApiResponse<WordStudyResult>>): Promise<void> => {
    const input = parseWordStudyRequest(req.body);
    const data = await this.service.generate(input, getRequestId(req));
    res.status(200).json({ success: true, message: "Word study generated", data });
  };

  providers = (_req: Request, res: Response<ApiResponse<WordStudyProviderCatalog>>): void => {
    res.status(200).json({ success: true, message: "AI providers fetched", data: this.service.listProviders() });
  };
}
