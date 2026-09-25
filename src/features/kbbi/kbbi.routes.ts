import { NextFunction, Request, Response, Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { aiRateLimiter, scraperRateLimiter } from "../../middlewares/rate-limit.middleware";
import type KbbiController from "./kbbi.controller";

export function createKbbiRouter(kbbiController: KbbiController): Router {
  const router = Router();

  router.get(
    "/search/:word",
    scraperRateLimiter,
    asyncHandler(kbbiController.lookup),
    (req: Request, res: Response, next: NextFunction) =>
      kbbiController.needsAiFallback(req, res) ? aiRateLimiter(req, res, next) : next(),
    asyncHandler(kbbiController.search),
  );

  return router;
}
