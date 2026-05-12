import { Router, Request, Response } from "express";
import config from "../config";
import KbbiController from "../controllers/kbbi.controller";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    message: "Welcome to New KBBI API",
    endpoint: "/search/[word]",
    example: `${config.baseUrl}/search/demokrasi`,
  });
});

router.get("/search/:word", KbbiController.search);

export default router;
