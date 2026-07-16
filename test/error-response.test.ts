import { describe, expect, it } from "vitest";
import { buildErrorResponse } from "../src/middlewares/error.middleware";
import { UpstreamHttpError } from "../src/lib/http-client";

describe("buildErrorResponse", () => {
  it("hides unknown error details in production", () => {
    expect(buildErrorResponse(new Error("database password leaked"), "production")).toEqual({
      statusCode: 500,
      body: {
        success: false,
        message: "Internal server error",
      },
    });
  });

  it("includes unknown error details outside production", () => {
    expect(buildErrorResponse(new Error("local debugging detail"), "development")).toEqual({
      statusCode: 500,
      body: {
        success: false,
        message: "Internal server error",
        error: "local debugging detail",
      },
    });
  });

  it("preserves upstream error status and safe message", () => {
    expect(
      buildErrorResponse(
        new UpstreamHttpError("Upstream request timed out", {
          statusCode: 504,
        }),
        "production",
      ),
    ).toEqual({
      statusCode: 504,
      body: {
        success: false,
        message: "Upstream request timed out",
      },
    });
  });
});
