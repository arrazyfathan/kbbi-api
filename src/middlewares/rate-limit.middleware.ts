import { NextFunction, Request, Response } from "express";
import { MemoryStore, rateLimit } from "express-rate-limit";
import config from "../config";
import { getRuntimeApiSettings, RuntimeApiSettings } from "../config/runtime-api-settings";
import { rateLimitedError } from "../lib/api-error";
import { getRequestId, setRequestIdHeader } from "../lib/request-id";
import logger from "../lib/logger";

type RateLimitConfig = {
  windowMs: number;
  max: number;
};

export function createRateLimiter(options: RateLimitConfig, store?: MemoryStore) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    ...(store ? { store } : {}),
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

const aiRateLimitStore = new MemoryStore();
let aiLimiter: ReturnType<typeof createRateLimiter> | undefined;
let appliedAiSettings: RuntimeApiSettings | undefined;

export async function aiRateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const settings = await getRuntimeApiSettings();
  if (!aiLimiter || !sameAiRateSettings(appliedAiSettings, settings)) {
    const windowChanged = appliedAiSettings?.aiRateLimitWindowMs !== undefined &&
      appliedAiSettings.aiRateLimitWindowMs !== settings.aiRateLimitWindowMs;
    aiLimiter = createRateLimiter({ windowMs: settings.aiRateLimitWindowMs, max: settings.aiRateLimitMax }, aiRateLimitStore);
    if (windowChanged) {
      const resetAt = Date.now() + settings.aiRateLimitWindowMs;
      for (const client of new Set([...aiRateLimitStore.current.values(), ...aiRateLimitStore.previous.values()])) {
        client.resetTime.setTime(resetAt);
      }
    }
    appliedAiSettings = settings;
  }
  await aiLimiter(req, res, next);
}

function sameAiRateSettings(previous: RuntimeApiSettings | undefined, current: RuntimeApiSettings): boolean {
  return previous?.aiRateLimitWindowMs === current.aiRateLimitWindowMs && previous.aiRateLimitMax === current.aiRateLimitMax;
}
