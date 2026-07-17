import { Router, Request, Response } from "express";
import config from "../config";
import HealthController from "../controllers/health.controller";
import IndonesianFigureController from "../controllers/indonesian-figure.controller";
import KbbiController from "../controllers/kbbi.controller";
import ProverbController from "../controllers/proverb.controller";
import WordController from "../controllers/word.controller";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    message: "Welcome to New KBBI API",
    endpoints: [
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

router.get("/health/supabase", asyncHandler(HealthController.supabase));
router.get("/search/:word", asyncHandler(KbbiController.search));
router.get("/words/top", asyncHandler(WordController.topVisited));
router.get("/proverb", asyncHandler(ProverbController.list));
router.get("/proverb/search", asyncHandler(ProverbController.search));
router.get("/proverb/:slug", asyncHandler(ProverbController.detail));
router.get("/figure", asyncHandler(IndonesianFigureController.list));
router.get("/figure/search", asyncHandler(IndonesianFigureController.search));
router.get("/figure/:slug", asyncHandler(IndonesianFigureController.detail));

export default router;
