import { describe, expect, it } from "vitest";
import { parseWordStudyRequest } from "../src/features/ai-word-study/ai-word-study.schema";
import { API_ERROR_CODES } from "../src/lib/api-error";

function validRequest() {
  return {
    word: " bahasa ",
    language: "id",
    entries: [
      {
        headword: " bahasa ",
        definitions: [{ wordClass: " n ", description: " sistem lambang bunyi " }],
      },
    ],
  };
}

describe("word study request validation", () => {
  it("trims request strings while preserving empty word classes", () => {
    const request = validRequest();
    request.entries[0].definitions[0].wordClass = "   ";

    expect(parseWordStudyRequest(request)).toEqual({
      word: "bahasa",
      language: "id",
      entries: [{ headword: "bahasa", definitions: [{ wordClass: "", description: "sistem lambang bunyi" }] }],
    });
  });

  it("accepts optional provider and model selection", () => {
    expect(
      parseWordStudyRequest({ ...validRequest(), provider: " OpenRouter ", model: " vendor/model " }),
    ).toMatchObject({
      provider: "OpenRouter",
      model: "vendor/model",
    });
  });

  it.each([
    ["unknown root property", { ...validRequest(), extra: true }],
    ["invalid language", { ...validRequest(), language: "fr" }],
    ["invalid provider ID", { ...validRequest(), provider: "https://provider.example.com" }],
    ["blank model", { ...validRequest(), model: " " }],
    ["blank word", { ...validRequest(), word: " " }],
    ["long word", { ...validRequest(), word: "a".repeat(101) }],
    ["no entries", { ...validRequest(), entries: [] }],
    ["too many entries", { ...validRequest(), entries: Array(11).fill(validRequest().entries[0]) }],
    ["blank headword", { ...validRequest(), entries: [{ ...validRequest().entries[0], headword: " " }] }],
    ["no definitions", { ...validRequest(), entries: [{ headword: "bahasa", definitions: [] }] }],
    [
      "too many definitions",
      {
        ...validRequest(),
        entries: [{ headword: "bahasa", definitions: Array(21).fill({ wordClass: "", description: "x" }) }],
      },
    ],
    [
      "long word class",
      {
        ...validRequest(),
        entries: [{ headword: "bahasa", definitions: [{ wordClass: "x".repeat(51), description: "x" }] }],
      },
    ],
    [
      "blank description",
      { ...validRequest(), entries: [{ headword: "bahasa", definitions: [{ wordClass: "", description: " " }] }] },
    ],
    [
      "long description",
      {
        ...validRequest(),
        entries: [{ headword: "bahasa", definitions: [{ wordClass: "", description: "x".repeat(1001) }] }],
      },
    ],
    [
      "unknown definition property",
      {
        ...validRequest(),
        entries: [{ headword: "bahasa", definitions: [{ wordClass: "", description: "x", injected: true }] }],
      },
    ],
  ])("rejects %s", (_name, input) => {
    expect(() => parseWordStudyRequest(input)).toThrow(
      expect.objectContaining({ statusCode: 400, code: API_ERROR_CODES.VALIDATION_ERROR }),
    );
  });

  it("accepts exactly 12000 description characters and rejects 12001", () => {
    const definitions = Array.from({ length: 12 }, () => ({ wordClass: "", description: "x".repeat(1000) }));
    expect(parseWordStudyRequest({ ...validRequest(), entries: [{ headword: "bahasa", definitions }] })).toBeDefined();
    definitions.push({ wordClass: "", description: "x" });
    try {
      parseWordStudyRequest({ ...validRequest(), entries: [{ headword: "bahasa", definitions }] });
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toMatchObject({ details: [expect.objectContaining({ reason: expect.stringContaining("12000") })] });
    }
  });
});
