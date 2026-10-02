import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { aiRateLimiter, scraperRateLimiter } from "../../middlewares/rate-limit.middleware";
import type ProverbController from "./proverb.controller";

export function createProverbRouter(proverbController: ProverbController): Router {
  const router = Router();

  router.get("/proverb", asyncHandler(proverbController.list));
  router.get("/proverb/search", scraperRateLimiter, asyncHandler(proverbController.search));
  router.get(
    "/proverb/:slug",
    asyncHandler(proverbController.lookupDetail),
    (req, res, next) => (proverbController.needsAiFallback(req, res) ? aiRateLimiter(req, res, next) : next()),
    asyncHandler(proverbController.detail),
  );

  return router;
}
