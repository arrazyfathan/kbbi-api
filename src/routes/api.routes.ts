import { Router, Request, Response } from "express";
import type { AppControllers } from "../app-dependencies";
import config from "../config";
import { asyncHandler } from "../lib/async-handler";
import { scraperRateLimiter } from "../middlewares/rate-limit.middleware";

export function createApiRouter(controllers: AppControllers): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    res.status(200).json({
      message: "Welcome to New KBBI API",
      endpoints: [
        "/health/live",
        "/health/ready",
        "/health/supabase",
        "/search/[word]",
        "/words/top",
        "/proverb",
        "/proverb/search",
        "/proverb/[slug]",
        "/figure",
        "/figure/search",
        "/figure/[slug]",
      ],
      examples: [
        `${config.baseUrl}/health/live`,
        `${config.baseUrl}/health/ready`,
        `${config.baseUrl}/health/supabase`,
        `${config.baseUrl}/search/demokrasi`,
        `${config.baseUrl}/words/top?limit=10`,
        `${config.baseUrl}/proverb?page=1&limit=20`,
        `${config.baseUrl}/proverb/search?q=air`,
        `${config.baseUrl}/proverb/Abu_saja_tak_hinggap`,
        `${config.baseUrl}/figure?page=1&limit=10`,
        `${config.baseUrl}/figure/search?q=soekarno`,
        `${config.baseUrl}/figure/Soekarno`,
      ],
    });
  });

  router.get("/health/live", asyncHandler(controllers.healthController.live));
  router.get("/health/ready", asyncHandler(controllers.healthController.ready));
  router.get("/health/supabase", asyncHandler(controllers.healthController.supabase));
  router.get("/search/:word", scraperRateLimiter, asyncHandler(controllers.kbbiController.search));
  router.get("/words/top", asyncHandler(controllers.wordController.topVisited));
  router.get("/proverb", asyncHandler(controllers.proverbController.list));
  router.get("/proverb/search", scraperRateLimiter, asyncHandler(controllers.proverbController.search));
  router.get("/proverb/:slug", asyncHandler(controllers.proverbController.detail));
  router.get("/figure", asyncHandler(controllers.indonesianFigureController.list));
  router.get("/figure/search", scraperRateLimiter, asyncHandler(controllers.indonesianFigureController.search));
  router.get("/figure/:slug", asyncHandler(controllers.indonesianFigureController.detail));

  return router;
}

export default createApiRouter;
