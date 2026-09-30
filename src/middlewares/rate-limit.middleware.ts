import { NextFunction, Request, RequestHandler, Response } from "express";
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
    validate: { unsharedStore: false },
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

const globalRateLimitStore = new MemoryStore();
const scraperRateLimitStore = new MemoryStore();
let globalLimiter: ReturnType<typeof createRateLimiter> | undefined;
let scraperLimiter: ReturnType<typeof createRateLimiter> | undefined;
let appliedGlobalSettings: RateLimitConfig | undefined;
let appliedScraperSettings: RateLimitConfig | undefined;

export const globalRateLimiter: RequestHandler = async (req, res, next) => {
  const settings = await getRuntimeApiSettings();
  globalLimiter = updateLimiter(
    globalLimiter,
    globalRateLimitStore,
    appliedGlobalSettings,
    { windowMs: settings.globalRateLimitWindowMs, max: settings.globalRateLimitMax },
    (nextSettings) => {
      appliedGlobalSettings = nextSettings;
    },
  );
  await globalLimiter(req, res, next);
};

export const scraperRateLimiter: RequestHandler = async (req, res, next) => {
  const settings = await getRuntimeApiSettings();
  scraperLimiter = updateLimiter(
    scraperLimiter,
    scraperRateLimitStore,
    appliedScraperSettings,
    { windowMs: settings.scraperRateLimitWindowMs, max: settings.scraperRateLimitMax },
    (nextSettings) => {
      appliedScraperSettings = nextSettings;
    },
  );
  await scraperLimiter(req, res, next);
};

const aiRateLimitStore = new MemoryStore();
let aiLimiter: ReturnType<typeof createRateLimiter> | undefined;
let appliedAiSettings: RuntimeApiSettings | undefined;

export async function aiRateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const settings = await getRuntimeApiSettings();
  aiLimiter = updateLimiter(
    aiLimiter,
    aiRateLimitStore,
    appliedAiSettings
      ? { windowMs: appliedAiSettings.aiRateLimitWindowMs, max: appliedAiSettings.aiRateLimitMax }
      : undefined,
    { windowMs: settings.aiRateLimitWindowMs, max: settings.aiRateLimitMax },
    () => {
      appliedAiSettings = settings;
    },
  );
  await aiLimiter(req, res, next);
}

function updateLimiter(
  limiter: ReturnType<typeof createRateLimiter> | undefined,
  store: MemoryStore,
  previous: RateLimitConfig | undefined,
  current: RateLimitConfig,
  onUpdate: (settings: RateLimitConfig) => void,
) {
  if (!limiter || previous?.windowMs !== current.windowMs || previous.max !== current.max) {
    if (previous?.windowMs !== undefined && previous.windowMs !== current.windowMs) {
      const resetAt = Date.now() + current.windowMs;
      for (const client of new Set([...store.current.values(), ...store.previous.values()]))
        client.resetTime.setTime(resetAt);
    }
    limiter = createRateLimiter(current, store);
    onUpdate(current);
  }
  return limiter;
}
