import { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import config from "../config";
import { rateLimitedError } from "../lib/api-error";
import { getRequestId, setRequestIdHeader } from "../lib/request-id";

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
  const requestId = getRequestId(req);

  if (requestId) {
    setRequestIdHeader(res, requestId);
  }

  res.status(429).json({
    success: false,
    message: error.message,
    code: error.code,
    ...(requestId ? { requestId } : {}),
  });
}

export const globalRateLimiter = createRateLimiter(config.rateLimit.global);
export const scraperRateLimiter = createRateLimiter(config.rateLimit.scraper);
