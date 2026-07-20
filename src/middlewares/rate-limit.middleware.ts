import { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import config from "../config";

type RateLimitConfig = {
  windowMs: number;
  max: number;
};

export function createRateLimiter(options: RateLimitConfig) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: rateLimitHandler,
  });
}

export function rateLimitHandler(req: Request, res: Response) {
  res.status(429).json({
    success: false,
    message: "Too many requests",
  });
}

export const globalRateLimiter = createRateLimiter(config.rateLimit.global);
export const scraperRateLimiter = createRateLimiter(config.rateLimit.scraper);
