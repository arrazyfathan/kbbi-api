import { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import config from "../config";
import { rateLimitedError } from "../lib/api-error";
import { getRequestId, setRequestIdHeader } from "../lib/request-id";
import logger from "../lib/logger";

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

  if (req.path === "/ai/word-study" || req.path === "/api/v1/ai/word-study") {
    logger.info(
      {
        event: "ai_word_study",
        requestId,
        endpoint: "/api/v1/ai/word-study",
        outcome: "rate_limited",
        upstreamStatusCategory: "not_called",
        provider: config.defaultAiProvider ?? "unconfigured",
        durationMs: 0,
        timedOut: false,
        rateLimited: true,
      },
      "AI word study request rate limited",
    );
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
export const aiRateLimiter = createRateLimiter(config.rateLimit.ai);
