import { NextFunction, Request, RequestHandler, Response } from "express";
import { describe, expect, it } from "vitest";
import { API_ERROR_CODES } from "../src/lib/api-error";
import { createRateLimiter } from "../src/middlewares/rate-limit.middleware";

describe("rate limiting middleware", () => {
  it("allows requests within the configured limit", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });

    const response = await runMiddleware(limiter, "/words/top");

    expect(response.nextCalled).toBe(true);
    expect(response.statusCode).toBe(200);
    expect(response.headers.ratelimit).toBeDefined();
  });

  it("returns a consistent 429 response after the global limit is exceeded", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    await runMiddleware(limiter, "/words/top");
    const response = await runMiddleware(limiter, "/words/top");

    expect(response.nextCalled).toBe(false);
    expect(response.statusCode).toBe(429);
    expect(response.body).toEqual({
      success: false,
      message: "Too many requests",
      code: API_ERROR_CODES.RATE_LIMITED,
    });
    expect(response.headers.ratelimit).toBeDefined();
    expect(response.headers["retry-after"]).toBeDefined();
  });

  it("applies stricter limits only to scraper/search endpoints", async () => {
    const globalLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
    const scraperLimiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    await runRoute([globalLimiter, scraperLimiter], "/search/demokrasi");
    const blockedSearch = await runRoute([globalLimiter, scraperLimiter], "/search/demokrasi");

    expect(blockedSearch.nextCalled).toBe(false);
    expect(blockedSearch.statusCode).toBe(429);
    expect(blockedSearch.body).toEqual({
      success: false,
      message: "Too many requests",
      code: API_ERROR_CODES.RATE_LIMITED,
    });

    expect((await runRoute([globalLimiter], "/words/top")).statusCode).toBe(200);
    expect((await runRoute([globalLimiter], "/words/top")).statusCode).toBe(200);
  });
});

async function runRoute(middlewares: RequestHandler[], path: string): Promise<MiddlewareResult> {
  let latestResult: MiddlewareResult | undefined;

  for (const middleware of middlewares) {
    latestResult = await runMiddleware(middleware, path);

    if (!latestResult.nextCalled) {
      return latestResult;
    }
  }

  return latestResult ?? createMiddlewareResult();
}

async function runMiddleware(middleware: RequestHandler, path: string): Promise<MiddlewareResult> {
  const result = createMiddlewareResult();
  const req = createMockRequest(path);
  const res = createMockResponse(result);
  const next: NextFunction = (error?: unknown) => {
    if (error) {
      throw error;
    }

    result.nextCalled = true;
  };

  await Promise.resolve(middleware(req, res, next));

  return result;
}

function createMockRequest(path: string): Request {
  return {
    app: {
      get: () => false,
    },
    headers: {},
    ip: "127.0.0.1",
    method: "GET",
    originalUrl: path,
    path,
    socket: {
      remoteAddress: "127.0.0.1",
    },
  } as Request;
}

function createMockResponse(result: MiddlewareResult): Response {
  const res = {
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    setHeader: (name: string, value: number | string | readonly string[]) => {
      result.headers[name.toLowerCase()] = value;
      return res;
    },
    append: (name: string, value: string | string[]) => {
      const normalizedName = name.toLowerCase();
      const existing = result.headers[normalizedName];

      result.headers[normalizedName] = existing ? `${existing.toString()}, ${value.toString()}` : value;

      return res;
    },
    status: (statusCode: number) => {
      result.statusCode = statusCode;
      res.statusCode = statusCode;
      return res;
    },
    json: (body: unknown) => {
      result.body = body;
      res.headersSent = true;
      res.writableEnded = true;
      return res;
    },
  };

  return res as Response;
}

function createMiddlewareResult(): MiddlewareResult {
  return {
    body: undefined,
    headers: {},
    nextCalled: false,
    statusCode: 200,
  };
}

type MiddlewareResult = {
  body: unknown;
  headers: Record<string, number | string | readonly string[]>;
  nextCalled: boolean;
  statusCode: number;
};
