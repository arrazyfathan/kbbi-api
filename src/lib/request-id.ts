import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

type RequestWithId = Request & { id?: string };

export function resolveRequestId(header: Request["headers"]["x-request-id"]): string {
  const requestId = Array.isArray(header) ? header[0] : header;

  return requestId || randomUUID();
}

export function getRequestId(req: Request): string | undefined {
  const reqWithId = req as RequestWithId;
  const header = req.headers["x-request-id"];

  return reqWithId.id || (Array.isArray(header) ? header[0] : header);
}

export function setRequestIdHeader(res: Response, requestId: string): void {
  res.setHeader("x-request-id", requestId);
}
