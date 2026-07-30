import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import type WordController from "./word.controller";

export function createWordVisitRouter(wordController: WordController): Router {
  const router = Router();

  router.get("/words/top", asyncHandler(wordController.topVisited));

  return router;
}
