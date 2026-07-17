import { describe, expect, it } from "vitest";
import {
  parsePaginationParams,
  parseRequiredQuery,
  parseSlugParam,
  parseWordParam,
} from "../src/lib/request-validation";

describe("request validation", () => {
  it("defaults missing pagination values", () => {
    expect(parsePaginationParams({}, { maxLimit: 100 })).toEqual({
      success: true,
      data: {
        page: 1,
        limit: 20,
      },
    });
  });

  it("parses valid pagination values", () => {
    expect(parsePaginationParams({ page: "2", limit: "50" }, { maxLimit: 100 })).toEqual({
      success: true,
      data: {
        page: 2,
        limit: 50,
      },
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
    const result = parsePaginationParams(query, { maxLimit: 100 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.success).toBe(false);
      expect(result.response.message).toMatch(/Query parameter/);
    }
  });

  it("parses and trims required query values", () => {
    expect(parseRequiredQuery(" air ", "q")).toEqual({
      success: true,
      data: "air",
    });
  });

  it.each([undefined, "", "   ", ["air"]])("rejects missing or invalid q values %#", (value) => {
    expect(parseRequiredQuery(value, "q")).toEqual({
      success: false,
      response: {
        success: false,
        message: "Query parameter 'q' is required",
      },
    });
  });

  it("parses word params with normalized output", () => {
    expect(parseWordParam(" Demokrasi ")).toEqual({
      success: true,
      data: {
        word: "Demokrasi",
        normalizedWord: "demokrasi",
      },
    });
  });

  it("parses slug params with whitespace converted to underscores", () => {
    expect(parseSlugParam(" Ada gula ada semut ")).toEqual({
      success: true,
      data: "Ada_gula_ada_semut",
    });
  });
});
