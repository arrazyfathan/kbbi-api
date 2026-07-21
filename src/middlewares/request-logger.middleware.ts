import { randomUUID } from "node:crypto";
import { Request, Response } from "express";
import pinoHttp from "pino-http";
import logger from "../lib/logger";

export function shouldIgnoreRequestLog(req: Request): boolean {
  return req.path === "/favicon.ico" || req.url === "/favicon.ico";
}

export const requestLoggerMiddleware = pinoHttp({
  logger,
  autoLogging: {
    ignore: shouldIgnoreRequestLog,
  },
  genReqId: (req, res) => {
    const header = req.headers["x-request-id"];
    const requestId = Array.isArray(header) ? header[0] : header || randomUUID();

    res.setHeader("x-request-id", requestId);

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
