import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { scraperRateLimiter } from "../../middlewares/rate-limit.middleware";
import type KbbiController from "./kbbi.controller";

export function createKbbiRouter(kbbiController: KbbiController): Router {
  const router = Router();

  router.get("/search/:word", scraperRateLimiter, asyncHandler(kbbiController.search));

  return router;
}
