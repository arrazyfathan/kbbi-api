import { Router, Request, Response } from "express";
import type { AppControllers } from "../app-dependencies";
import config from "../config";
import { createFigureRouter } from "../features/figures/figure.routes";
import { createHealthRouter } from "../features/health/health.routes";
import { createKbbiRouter } from "../features/kbbi/kbbi.routes";
import { createProverbRouter } from "../features/proverbs/proverb.routes";
import { createWordVisitRouter } from "../features/word-visits/word-visit.routes";

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

  router.use(createHealthRouter(controllers.healthController));
  router.use(createKbbiRouter(controllers.kbbiController));
  router.use(createWordVisitRouter(controllers.wordController));
  router.use(createProverbRouter(controllers.proverbController));
  router.use(createFigureRouter(controllers.indonesianFigureController));

  return router;
}

export default createApiRouter;
