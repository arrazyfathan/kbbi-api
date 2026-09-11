import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { aiRateLimiter } from "../../middlewares/rate-limit.middleware";
import type AiWordStudyController from "./ai-word-study.controller";

export function createAiWordStudyRouter(controller: AiWordStudyController): Router {
  const router = Router();
  router.get("/ai/providers", controller.providers);
  router.post("/ai/word-study", aiRateLimiter, asyncHandler(controller.generate));
  return router;
}
