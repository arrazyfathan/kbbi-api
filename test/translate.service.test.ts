import { beforeEach, describe, expect, it, vi } from "vitest";

function mockGoogleResponse(segments: Array<[string, string]>): string {
  return JSON.stringify([segments, null, "id"]);
}

describe("TranslateService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const kbbiEntries = [
    {
      headword: "demokrasi",
      definitions: [{ wordClass: "n[Nomina]", description: "pemerintahan rakyat" }],
    },
  ];

  it("translates the word and every definition in a single newline batch request and builds the result", async () => {
    const getScraperHtml = vi.fn(async () =>
      mockGoogleResponse([
        ["democracy", "demokrasi"],
        ["people's government", "pemerintahan rakyat"],
      ]),
    );
    const { TranslateService, kbbiService } = await loadService(getScraperHtml);
    kbbiService.search.mockResolvedValueOnce(kbbiEntries);
    const service = new TranslateService(kbbiService);

    const result = await service.translate("demokrasi", "en");

    expect(kbbiService.search).toHaveBeenCalledWith("demokrasi");
    expect(getScraperHtml).toHaveBeenCalledTimes(1);
    expect(getScraperHtml).toHaveBeenCalledWith(
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=id&tl=en&dt=t&q=demokrasi%0Apemerintahan+rakyat",
      { timeoutMs: 10000, upstream: "googletranslate" },
    );
    expect(result).toEqual({
      word: "demokrasi",
      translation: "democracy",
      from: "id",
      to: "en",
      provider: "google",
      entries: [
        {
          headword: "demokrasi",
          definitions: [
            {
              wordClass: "n[Nomina]",
              description: "pemerintahan rakyat",
              translation: "people's government",
            },
          ],
        },
      ],
    });
  });

  it("stitches a long definition split across multiple batch segments back together", async () => {
    const longEntry = [
      {
        headword: "demokrasi",
        definitions: [{ wordClass: "n[Nomina]", description: "a; b" }],
      },
    ];
    const getScraperHtml = vi.fn(async () =>
      mockGoogleResponse([
        ["democracy", "demokrasi"],
        ["A ", "a; "],
        ["B", "b"],
      ]),
    );
    const { TranslateService, kbbiService } = await loadService(getScraperHtml);
    kbbiService.search.mockResolvedValueOnce(longEntry);
    const service = new TranslateService(kbbiService);

    const result = await service.translate("demokrasi", "en");

    expect(getScraperHtml).toHaveBeenCalledTimes(1);
    expect(result?.translation).toBe("democracy");
    expect(result?.entries[0].definitions[0].translation).toBe("A B");
  });

  it("reuses the cache before TTL expires", async () => {
    let now = 0;
    const getScraperHtml = vi.fn(async () =>
      mockGoogleResponse([
        ["democracy", "demokrasi"],
        ["people's government", "pemerintahan rakyat"],
      ]),
    );
    const { TranslateService, kbbiService } = await loadService(getScraperHtml);
    kbbiService.search.mockResolvedValue(kbbiEntries);
    const service = new TranslateService(kbbiService, { now: () => now });

    await service.translate("demokrasi", "en");
    now = 1000;
    await service.translate("demokrasi", "en");

    expect(getScraperHtml).toHaveBeenCalledTimes(1);
  });

  it("fetches again for a different target language", async () => {
    const getScraperHtml = vi.fn(async (url: string) => {
      const isMalay = url.includes("tl=ms");
      return mockGoogleResponse([
        [isMalay ? "demokrasi" : "democracy", "demokrasi"],
        [isMalay ? "kerajaan rakyat" : "people's government", "pemerintahan rakyat"],
      ]);
    });
    const { TranslateService, kbbiService } = await loadService(getScraperHtml);
    kbbiService.search.mockResolvedValue(kbbiEntries);
    const service = new TranslateService(kbbiService);

    await service.translate("demokrasi", "en");
    await service.translate("demokrasi", "ms");

    expect(getScraperHtml).toHaveBeenCalledTimes(2);
  });

  it("returns null when the word is not found in KBBI", async () => {
    const getScraperHtml = vi.fn(async () => "");
    const { TranslateService, kbbiService } = await loadService(getScraperHtml);
    kbbiService.search.mockResolvedValueOnce(null);
    const service = new TranslateService(kbbiService);

    const result = await service.translate("notfound", "en");

    expect(result).toBeNull();
    expect(getScraperHtml).not.toHaveBeenCalled();
  });

  it("falls back to per-definition requests when the batch cannot align all segments", async () => {
    const kbbiTwoEntry = [
      {
        headword: "demokrasi",
        definitions: [
          { wordClass: "n[Nomina]", description: "pemerintahan rakyat" },
          { wordClass: "n[Nomina]", description: "persamaan hak" },
        ],
      },
    ];
    const getScraperHtml = vi.fn(async (url: string) =>
      url.includes("%0A")
        ? mockGoogleResponse([["only-one", "pemerintahan rakyat"]])
        : url.includes("q=demokrasi")
          ? mockGoogleResponse([["democracy", "demokrasi"]])
          : mockGoogleResponse([["single translation", "irrelevant"]]),
    );
    const { TranslateService, kbbiService } = await loadService(getScraperHtml);
    kbbiService.search.mockResolvedValueOnce(kbbiTwoEntry);
    const service = new TranslateService(kbbiService);

    const result = await service.translate("demokrasi", "en");

    expect(getScraperHtml).toHaveBeenCalledTimes(4);
    expect(result?.translation).toBe("democracy");
    expect(result?.entries[0].definitions).toEqual([
      { wordClass: "n[Nomina]", description: "pemerintahan rakyat", translation: "single translation" },
      { wordClass: "n[Nomina]", description: "persamaan hak", translation: "single translation" },
    ]);
  });

  it("joins multiple segments when translating the word and a definition individually", async () => {
    const getScraperHtml = vi.fn(async (url: string) =>
      url.includes("%0A")
        ? mockGoogleResponse([["only-one", "does not match the description"]])
        : mockGoogleResponse([
            ["part one ", "s1"],
            ["part two", "s2"],
          ]),
    );
    const { TranslateService, kbbiService } = await loadService(getScraperHtml);
    kbbiService.search.mockResolvedValueOnce(kbbiEntries);
    const service = new TranslateService(kbbiService);

    const result = await service.translate("demokrasi", "en");

    expect(getScraperHtml).toHaveBeenCalledTimes(3);
    expect(result?.translation).toBe("part one part two");
    expect(result?.entries[0].definitions[0].translation).toBe("part one part two");
  });

  it("propagates the upstream error when every per-definition request fails", async () => {
    const getScraperHtml = vi.fn(async () => {
      throw new Error("translate.googleapis.com unreachable");
    });
    const { TranslateService, kbbiService } = await loadService(getScraperHtml);
    kbbiService.search.mockResolvedValueOnce(kbbiEntries);
    const service = new TranslateService(kbbiService);

    await expect(service.translate("demokrasi", "en")).rejects.toThrow("translate.googleapis.com unreachable");
  });

  it("falls back to Lara when every Google Translate request fails", async () => {
    const getScraperHtml = vi.fn(async () => {
      throw new Error("translate.googleapis.com unreachable");
    });
    const laraProvider = {
      translate: vi.fn(async () => ["democracy", "people's government"]),
    };
    const { TranslateService, kbbiService } = await loadService(getScraperHtml);
    kbbiService.search.mockResolvedValueOnce(kbbiEntries);
    const service = new TranslateService(kbbiService, { laraProvider });

    const result = await service.translate("demokrasi", "en");

    expect(laraProvider.translate).toHaveBeenCalledWith(["demokrasi", "pemerintahan rakyat"], "en");
    expect(result?.translation).toBe("democracy");
    expect(result?.provider).toBe("lara");
    expect(result?.entries[0].definitions[0].translation).toBe("people's government");
  });

  it("propagates the Lara error when Google and Lara both fail", async () => {
    const getScraperHtml = vi.fn(async () => {
      throw new Error("translate.googleapis.com unreachable");
    });
    const laraProvider = {
      translate: vi.fn(async () => {
        throw new Error("Lara quota exceeded");
      }),
    };
    const { TranslateService, kbbiService } = await loadService(getScraperHtml);
    kbbiService.search.mockResolvedValueOnce(kbbiEntries);
    const service = new TranslateService(kbbiService, { laraProvider });

    await expect(service.translate("demokrasi", "en")).rejects.toThrow("Lara quota exceeded");
  });
});

async function loadService(getScraperHtml: (url: string) => Promise<string>) {
  const kbbiService = { search: vi.fn() };

  vi.doMock("../src/config", () => ({
    default: {
      googleTranslateUrl: "https://translate.googleapis.com/translate_a/single",
      isLaraConfigured: false,
      upstream: { googleTranslateTimeoutMs: 10000, laraTranslateTimeoutMs: 10000 },
      cache: { translateTtlMs: 3600000 },
    },
  }));
  vi.doMock("../src/lib/http-client", () => ({
    getScraperHtml,
    isHttpNotFound: () => false,
    isUpstreamHttpError: () => false,
  }));

  const { TranslateService } = await import("../src/features/translate/translate.service");

  return { TranslateService, kbbiService };
}
