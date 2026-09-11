import { describe, expect, it, vi } from "vitest";
import { AiWordStudyService } from "../src/features/ai-word-study/ai-word-study.service";
import { AiProviderError } from "../src/features/ai-word-study/openai-word-study.provider";
import type { WordStudyProvider, WordStudyRequest } from "../src/features/ai-word-study/ai-word-study.types";
import { API_ERROR_CODES } from "../src/lib/api-error";

const request: WordStudyRequest = {
  word: "Bahasa",
  language: "id",
  entries: [{ headword: "bahasa", definitions: [{ wordClass: "n", description: "sistem lambang bunyi" }] }],
};

const content = {
  explanation: "Penjelasan",
  examples: ["Contoh satu", "Contoh dua"],
  usageNotes: ["Catatan satu", "Catatan dua"],
  relatedWords: ["berbahasa", "kebahasaan", "linguistik"],
};

function provider(output: unknown = content): WordStudyProvider & { generate: ReturnType<typeof vi.fn> } {
  return {
    name: "openai",
    defaultModel: "configured-model",
    models: ["configured-model", "alternate-model"],
    generate: vi.fn().mockResolvedValue(output),
  };
}

describe("AiWordStudyService", () => {
  it("validates model content and owns response metadata", async () => {
    const fake = provider({ ...content, success: false, provider: "attacker", model: "attacker" });
    await expect(new AiWordStudyService(fake).generate(request)).rejects.toMatchObject({
      statusCode: 502,
      code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE,
    });

    fake.generate.mockResolvedValueOnce(content);
    await expect(new AiWordStudyService(fake).generate(request)).resolves.toEqual({
      ...content,
      provider: "openai",
      model: "configured-model",
    });
  });

  it("accepts variable-length generated collections above the minimum", async () => {
    const dynamicContent = {
      ...content,
      examples: ["Contoh satu", "Contoh dua", "Contoh tiga"],
      usageNotes: ["Catatan satu", "Catatan dua", "Catatan tiga", "Catatan empat"],
      relatedWords: ["berbahasa", "kebahasaan", "linguistik", "tutur", "ujaran"],
    };

    await expect(new AiWordStudyService(provider(dynamicContent)).generate(request)).resolves.toMatchObject(
      dynamicContent,
    );
  });

  it.each([
    [{ ...content, explanation: " " }, "blank explanation"],
    [{ ...content, examples: ["one"] }, "wrong examples count"],
    [{ ...content, usageNotes: ["one", " "] }, "blank usage note"],
    [{ ...content, relatedWords: ["sama", "SAMA", "lain"] }, "duplicate related words"],
    [{ ...content, relatedWords: ["satu", "dua", "tiga", "SATU"] }, "duplicate in a longer related list"],
    [{ ...content, relatedWords: ["bahasa", "lain", "kata"] }, "main word repetition"],
  ])("rejects malformed output: %s (%s)", async (output) => {
    await expect(new AiWordStudyService(provider(output)).generate(request)).rejects.toMatchObject({ statusCode: 502 });
  });

  it.each([
    ["authentication", 502, API_ERROR_CODES.UPSTREAM_UNAVAILABLE],
    ["rate_limit", 502, API_ERROR_CODES.UPSTREAM_UNAVAILABLE],
    ["refusal", 502, API_ERROR_CODES.UPSTREAM_UNAVAILABLE],
    ["unavailable", 502, API_ERROR_CODES.UPSTREAM_UNAVAILABLE],
    ["malformed", 502, API_ERROR_CODES.UPSTREAM_UNAVAILABLE],
    ["timeout", 504, API_ERROR_CODES.UPSTREAM_TIMEOUT],
  ] as const)("maps %s safely", async (kind, statusCode, code) => {
    const fake = provider();
    fake.generate.mockRejectedValueOnce(new AiProviderError(kind));
    await expect(new AiWordStudyService(fake).generate(request)).rejects.toMatchObject({
      statusCode,
      code,
      message: expect.not.stringContaining("secret"),
    });
  });

  it("returns 503 when OpenAI is not configured", async () => {
    await expect(new AiWordStudyService().generate(request)).rejects.toMatchObject({
      statusCode: 503,
      code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE,
    });
  });

  it("does not cache identical requests", async () => {
    const fake = provider();
    const service = new AiWordStudyService(fake);
    await service.generate(request);
    await service.generate(request);
    expect(fake.generate).toHaveBeenCalledTimes(2);
  });

  it("selects only configured providers and allowlisted models", async () => {
    const first = provider();
    const second = { ...provider(), name: "compatible", defaultModel: "fast", models: ["fast", "smart"] };
    const service = new AiWordStudyService([first, second], "compatible");

    await expect(service.generate(request)).resolves.toMatchObject({
      provider: "compatible",
      model: "fast",
    });
    expect(second.generate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "compatible", model: "fast" }),
      "fast",
    );

    await expect(service.generate({ ...request, model: "smart" })).resolves.toMatchObject({
      provider: "compatible",
      model: "smart",
    });
    expect(second.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: "compatible", model: "smart" }),
      "smart",
    );

    await expect(service.generate({ ...request, provider: "missing" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.generate({ ...request, provider: "compatible", model: "unknown" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("lists public provider metadata without credentials or URLs", () => {
    expect(new AiWordStudyService(provider(), "openai").listProviders()).toEqual({
      defaultProvider: "openai",
      providers: [{ id: "openai", defaultModel: "configured-model", models: ["configured-model", "alternate-model"] }],
    });
  });
});
