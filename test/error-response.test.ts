import { describe, expect, it } from "vitest";
import { buildErrorResponse } from "../src/middlewares/error.middleware";
import { UpstreamHttpError } from "../src/lib/http-client";
import { API_ERROR_CODES, notFoundError, validationError } from "../src/lib/api-error";

describe("buildErrorResponse", () => {
  it("hides unknown error details in production", () => {
    expect(buildErrorResponse(new Error("database password leaked"), "production")).toEqual({
      statusCode: 500,
      body: {
        success: false,
        message: "Internal server error",
        code: API_ERROR_CODES.INTERNAL_ERROR,
      },
    });
  });

  it("includes unknown error details outside production", () => {
    expect(buildErrorResponse(new Error("local debugging detail"), "development")).toEqual({
      statusCode: 500,
      body: {
        success: false,
        message: "Internal server error",
        code: API_ERROR_CODES.INTERNAL_ERROR,
        error: "local debugging detail",
      },
    });
  });

  it("serializes validation errors with details", () => {
    expect(
      buildErrorResponse(
        validationError("Query parameter 'q' is required", [
          {
            field: "q",
            location: "query",
            reason: "Required non-empty string",
          },
        ]),
        "production",
      ),
    ).toEqual({
      statusCode: 400,
      body: {
        success: false,
        message: "Query parameter 'q' is required",
        code: API_ERROR_CODES.VALIDATION_ERROR,
        details: [
          {
            field: "q",
            location: "query",
            reason: "Required non-empty string",
          },
        ],
      },
    });
  });

  it("serializes not found errors", () => {
    expect(buildErrorResponse(notFoundError("Word not found"), "production")).toEqual({
      statusCode: 404,
      body: {
        success: false,
        message: "Word not found",
        code: API_ERROR_CODES.NOT_FOUND,
      },
    });
  });

  it("preserves upstream timeout status and safe message", () => {
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
        code: API_ERROR_CODES.UPSTREAM_TIMEOUT,
      },
    });
  });

  it("maps upstream availability failures to a stable code", () => {
    expect(
      buildErrorResponse(
        new UpstreamHttpError("Upstream service is unavailable", {
          statusCode: 502,
        }),
        "production",
      ),
    ).toEqual({
      statusCode: 502,
      body: {
        success: false,
        message: "Upstream service is unavailable",
        code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE,
      },
    });
  });
});
