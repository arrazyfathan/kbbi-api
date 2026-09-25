import { NextFunction, Request, Response, Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { aiRateLimiter, scraperRateLimiter } from "../../middlewares/rate-limit.middleware";
import type TranslateController from "./translate.controller";

export function createTranslateRouter(translateController: TranslateController): Router {
  const router = Router();

  router.get(
    "/translate/:word",
    scraperRateLimiter,
    asyncHandler(translateController.lookup),
    (req: Request, res: Response, next: NextFunction) =>
      translateController.needsAiFallback(req, res) ? aiRateLimiter(req, res, next) : next(),
    asyncHandler(translateController.translate),
  );

  return router;
}
