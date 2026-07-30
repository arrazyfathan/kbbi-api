import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { scraperRateLimiter } from "../../middlewares/rate-limit.middleware";
import type IndonesianFigureController from "./indonesian-figure.controller";

export function createFigureRouter(indonesianFigureController: IndonesianFigureController): Router {
  const router = Router();

  router.get("/figure", asyncHandler(indonesianFigureController.list));
  router.get("/figure/search", scraperRateLimiter, asyncHandler(indonesianFigureController.search));
  router.get("/figure/:slug", asyncHandler(indonesianFigureController.detail));

  return router;
}
