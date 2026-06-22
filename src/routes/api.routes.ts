import { Router, Request, Response } from "express";
import config from "../config";
import KbbiController from "../controllers/kbbi.controller";
import ProverbController from "../controllers/proverb.controller";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    message: "Welcome to New KBBI API",
    endpoints: ["/search/[word]", "/proverb", "/proverb/search", "/proverb/[slug]"],
    examples: [
      `${config.baseUrl}/search/demokrasi`,
      `${config.baseUrl}/proverb?page=1&limit=20`,
      `${config.baseUrl}/proverb/search?q=air`,
      `${config.baseUrl}/proverb/Abu_saja_tak_hinggap`,
    ],
  });
});

router.get("/search/:word", KbbiController.search);
router.get("/proverb", ProverbController.list);
router.get("/proverb/search", ProverbController.search);
router.get("/proverb/:slug", ProverbController.detail);

export default router;
