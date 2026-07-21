import { Request } from "express";
import { describe, expect, it } from "vitest";
import { shouldIgnoreRequestLog } from "../src/middlewares/request-logger.middleware";

describe("request logger middleware", () => {
  it("ignores browser favicon requests", () => {
    expect(shouldIgnoreRequestLog({ path: "/favicon.ico", url: "/favicon.ico" } as Request)).toBe(true);
  });

  it("does not ignore API requests", () => {
    expect(shouldIgnoreRequestLog({ path: "/search/demokrasi", url: "/search/demokrasi" } as Request)).toBe(false);
  });
});
