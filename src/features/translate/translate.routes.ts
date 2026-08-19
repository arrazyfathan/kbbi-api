import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { scraperRateLimiter } from "../../middlewares/rate-limit.middleware";
import type TranslateController from "./translate.controller";

export function createTranslateRouter(translateController: TranslateController): Router {
  const router = Router();

  router.get("/translate/:word", scraperRateLimiter, asyncHandler(translateController.translate));

  return router;
}
