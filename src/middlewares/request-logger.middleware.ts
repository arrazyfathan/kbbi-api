import { Request, Response } from "express";
import pinoHttp from "pino-http";
import logger from "../lib/logger";
import { resolveRequestId, setRequestIdHeader } from "../lib/request-id";

const VISITOR_ID_HEADER = "x-visitor-id";
const REDACTED_HEADER_VALUE = "[Redacted]";

export function shouldIgnoreRequestLog(req: Request): boolean {
  return req.path === "/favicon.ico" || req.url === "/favicon.ico";
}

export function redactVisitorIdHeader(headers: Request["headers"]): Request["headers"] {
  if (!headers[VISITOR_ID_HEADER]) {
    return headers;
  }

  return {
    ...headers,
    [VISITOR_ID_HEADER]: REDACTED_HEADER_VALUE,
  };
}

export const requestLoggerMiddleware = pinoHttp({
  logger,
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        headers: redactVisitorIdHeader(req.headers),
      };
    },
  },
  autoLogging: {
    ignore: shouldIgnoreRequestLog,
  },
  genReqId: (req, res) => {
    const requestId = resolveRequestId(req.headers["x-request-id"]);

    setRequestIdHeader(res, requestId);

    return requestId;
  },
  customProps: (req: Request, res: Response) => ({
    requestId: req.id,
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
  }),
  customSuccessMessage: (req: Request, res: Response) =>
    `${req.method} ${req.originalUrl || req.url} completed with ${res.statusCode}`,
  customErrorMessage: (req: Request, res: Response) =>
    `${req.method} ${req.originalUrl || req.url} failed with ${res.statusCode}`,
});
