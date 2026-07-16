import { ErrorRequestHandler, Request } from "express";
import { ApiResponse } from "../interfaces/kbbi.interface";
import { isUpstreamHttpError } from "../lib/http-client";
import logger from "../lib/logger";

export function buildErrorResponse(error: unknown, nodeEnv = process.env.NODE_ENV): {
  statusCode: number;
  body: ApiResponse<never>;
} {
  if (isUpstreamHttpError(error)) {
    return {
      statusCode: error.statusCode,
      body: {
        success: false,
        message: error.message,
        ...(nodeEnv !== "production" ? { error: error.message } : {}),
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
      ...(nodeEnv !== "production" ? { error: detail } : {}),
    },
  };
}

export const errorMiddleware: ErrorRequestHandler = (error, req, res, next) => {
  const { statusCode, body } = buildErrorResponse(error);
  const requestId = getRequestId(req);
  const errorObject = error instanceof Error ? error : new Error(String(error));

  logger.error(
    {
      err: errorObject,
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
    },
    "Request failed",
  );

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(statusCode).json(body);
};

function getRequestId(req: Request): string | undefined {
  const reqWithId = req as Request & { id?: string };
  const header = req.headers["x-request-id"];

  return reqWithId.id || (Array.isArray(header) ? header[0] : header);
}
