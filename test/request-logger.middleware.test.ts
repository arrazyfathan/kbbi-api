import { Request } from "express";
import { describe, expect, it } from "vitest";
import { resolveRequestId } from "../src/lib/request-id";
import { redactVisitorIdHeader, shouldIgnoreRequestLog } from "../src/middlewares/request-logger.middleware";

describe("request logger middleware", () => {
  it("ignores browser favicon requests", () => {
    expect(shouldIgnoreRequestLog({ path: "/favicon.ico", url: "/favicon.ico" } as Request)).toBe(true);
  });

  it("does not ignore API requests", () => {
    expect(shouldIgnoreRequestLog({ path: "/search/demokrasi", url: "/search/demokrasi" } as Request)).toBe(false);
  });

  it("preserves a client-provided request ID", () => {
    expect(resolveRequestId("client-request-1")).toBe("client-request-1");
  });

  it("uses the first request ID header value when multiple are provided", () => {
    expect(resolveRequestId(["client-request-1", "client-request-2"])).toBe("client-request-1");
  });

  it("generates a request ID when the header is missing", () => {
    expect(resolveRequestId(undefined)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("redacts visitor IDs from logged headers", () => {
    const headers = redactVisitorIdHeader({
      host: "localhost:3000",
      "x-visitor-id": "raw-visitor-id",
    });

    expect(headers).toEqual({
      host: "localhost:3000",
      "x-visitor-id": "[Redacted]",
    });
  });
});
