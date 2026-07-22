import { describe, expect, it } from "vitest";
import {
  parseBooleanQuery,
  parsePaginationParams,
  parseRequiredQuery,
  parseSlugParam,
  parseWordParam,
} from "../src/lib/request-validation";
import { API_ERROR_CODES } from "../src/lib/api-error";

describe("request validation", () => {
  it("defaults missing pagination values", () => {
    expect(parsePaginationParams({}, { maxLimit: 100 })).toEqual({
      page: 1,
      limit: 20,
    });
  });

  it("parses valid pagination values", () => {
    expect(parsePaginationParams({ page: "2", limit: "50" }, { maxLimit: 100 })).toEqual({
      page: 2,
      limit: 50,
    });
  });

  it.each([
    { page: "abc", limit: "20" },
    { page: "0", limit: "20" },
    { page: "-1", limit: "20" },
    { page: "1.5", limit: "20" },
    { page: "", limit: "20" },
    { page: ["1"], limit: "20" },
    { page: "1", limit: "101" },
  ])("rejects invalid pagination values %#", (query) => {
    expect(() => parsePaginationParams(query, { maxLimit: 100 })).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: expect.stringMatching(/Query parameter/),
      }),
    );
  });

  it("parses and trims required query values", () => {
    expect(parseRequiredQuery(" air ", "q")).toBe("air");
  });

  it("parses optional boolean query values", () => {
    expect(parseBooleanQuery(undefined, "includeDetails")).toBe(false);
    expect(parseBooleanQuery(undefined, "includeDetails", true)).toBe(true);
    expect(parseBooleanQuery("true", "includeDetails")).toBe(true);
    expect(parseBooleanQuery("false", "includeDetails")).toBe(false);
  });

  it.each(["", "TRUE", "1", true, ["true"]])("rejects invalid boolean query values %#", (value) => {
    expect(() => parseBooleanQuery(value, "includeDetails")).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: "Query parameter 'includeDetails' must be either 'true' or 'false'",
      }),
    );
  });

  it.each([undefined, "", "   ", ["air"]])("rejects missing or invalid q values %#", (value) => {
    expect(() => parseRequiredQuery(value, "q")).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: "Query parameter 'q' is required",
      }),
    );
  });

  it("parses word params with normalized output", () => {
    expect(parseWordParam(" Demokrasi ")).toEqual({
      word: "Demokrasi",
      normalizedWord: "demokrasi",
    });
  });

  it("parses slug params with whitespace converted to underscores", () => {
    expect(parseSlugParam(" Ada gula ada semut ")).toBe("Ada_gula_ada_semut");
  });
});
