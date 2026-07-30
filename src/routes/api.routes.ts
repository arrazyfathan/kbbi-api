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
        "/api/v1/search/[word]",
        "/api/v1/words/top",
        "/api/v1/proverb",
        "/api/v1/proverb/search",
        "/api/v1/proverb/[slug]",
        "/api/v1/figure",
        "/api/v1/figure/search",
        "/api/v1/figure/[slug]",
      ],
      examples: [
        `${config.baseUrl}/health/live`,
        `${config.baseUrl}/health/ready`,
        `${config.baseUrl}/health/supabase`,
        `${config.baseUrl}/api/v1/search/demokrasi`,
        `${config.baseUrl}/api/v1/words/top?limit=10`,
        `${config.baseUrl}/api/v1/proverb?page=1&limit=20`,
        `${config.baseUrl}/api/v1/proverb/search?q=air`,
        `${config.baseUrl}/api/v1/proverb/Abu_saja_tak_hinggap`,
        `${config.baseUrl}/api/v1/figure?page=1&limit=10`,
        `${config.baseUrl}/api/v1/figure/search?q=soekarno`,
        `${config.baseUrl}/api/v1/figure/Soekarno`,
      ],
    });
  });

  router.use(createHealthRouter(controllers.healthController));
  router.use("/api/v1", createDomainRouter(controllers));
  router.use(createDomainRouter(controllers));

  return router;
}

function createDomainRouter(controllers: AppControllers): Router {
  const router = Router();

  router.use(createKbbiRouter(controllers.kbbiController));
  router.use(createWordVisitRouter(controllers.wordController));
  router.use(createProverbRouter(controllers.proverbController));
  router.use(createFigureRouter(controllers.indonesianFigureController));

  return router;
}

export default createApiRouter;
