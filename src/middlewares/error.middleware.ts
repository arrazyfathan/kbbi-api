import { ErrorRequestHandler } from "express";
import type { ApiResponse } from "../lib/api-response.types";
import { API_ERROR_CODES, isApiError } from "../lib/api-error";
import { isUpstreamHttpError } from "../lib/http-client";
import logger from "../lib/logger";
import { getRequestId, setRequestIdHeader } from "../lib/request-id";

export function buildErrorResponse(
  error: unknown,
  nodeEnv = process.env.NODE_ENV,
  requestId?: string,
): {
  statusCode: number;
  body: ApiResponse<never>;
} {
  if (isApiError(error)) {
    return {
      statusCode: error.statusCode,
      body: {
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  if (isUpstreamHttpError(error)) {
    const code = error.statusCode === 504 ? API_ERROR_CODES.UPSTREAM_TIMEOUT : API_ERROR_CODES.UPSTREAM_UNAVAILABLE;

    return {
      statusCode: error.statusCode,
      body: {
        success: false,
        message: error.message,
        code,
        ...(requestId ? { requestId } : {}),
      },
    };
  }

  const message = "Internal server error";
  const detail = error instanceof Error ? error.message : String(error);

  return {
    statusCode: 500,
    body: {
      success: false,
      message,
      code: API_ERROR_CODES.INTERNAL_ERROR,
      ...(nodeEnv !== "production" ? { error: detail } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };
}

export const errorMiddleware: ErrorRequestHandler = (error, req, res, next) => {
  const requestId = getRequestId(req);
  const { statusCode, body } = buildErrorResponse(error, process.env.NODE_ENV, requestId);
  const errorObject = error instanceof Error ? error : new Error(String(error));

  logger.error(
    {
      err: errorObject,
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
      ...(isUpstreamHttpError(error)
        ? {
            upstream: error.upstream,
            upstreamHost: error.urlHost,
            upstreamStatus: error.upstreamStatus,
            upstreamDurationMs: error.durationMs,
            upstreamAttempts: error.attempts,
            upstreamErrorCode: error.errorCode,
          }
        : {}),
    },
    "Request failed",
  );

  if (res.headersSent) {
    next(error);
    return;
  }

  if (requestId) {
    setRequestIdHeader(res, requestId);
  }

  res.status(statusCode).json(body);
};
