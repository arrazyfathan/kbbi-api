import { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import config from "../config";
import { rateLimitedError } from "../lib/api-error";

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
  const error = rateLimitedError();

  res.status(429).json({
    success: false,
    message: error.message,
    code: error.code,
  });
}

export const globalRateLimiter = createRateLimiter(config.rateLimit.global);
export const scraperRateLimiter = createRateLimiter(config.rateLimit.scraper);
