import { beforeEach, describe, expect, it, vi } from "vitest";
import WordController from "../src/features/word-visits/word.controller";

describe("WordController.topVisited", () => {
  let wordVisitService: { getTopVisitedWords: ReturnType<typeof vi.fn> };
  let controller: WordController;

  beforeEach(() => {
    wordVisitService = { getTopVisitedWords: vi.fn() };
    controller = new WordController(wordVisitService);
  });

  it("returns top visited words with the requested limit", async () => {
    wordVisitService.getTopVisitedWords.mockResolvedValueOnce([
      { word: "demokrasi", visitorCount: 12 },
      { word: "ajar", visitorCount: 8 },
    ]);

    const { req, res, body } = createRequestResponse({ query: { limit: "5" } });

    await controller.topVisited(req, res);

    expect(wordVisitService.getTopVisitedWords).toHaveBeenCalledWith(5);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body.value).toEqual({
      success: true,
      message: "Top visited words fetched successfully",
      data: {
        count: 2,
        items: [
          { word: "demokrasi", visitorCount: 12 },
          { word: "ajar", visitorCount: 8 },
        ],
      },
    });
  });

  it("passes the default limit when limit is invalid", async () => {
    wordVisitService.getTopVisitedWords.mockResolvedValueOnce([]);

    const { req, res } = createRequestResponse({ query: { limit: "invalid" } });

    await controller.topVisited(req, res);

    expect(wordVisitService.getTopVisitedWords).toHaveBeenCalledWith(10);
  });
});

function createRequestResponse(input: { query?: Record<string, string> }) {
  const body: { value?: any } = {};
  const req = {
    query: input.query || {},
  } as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn((value: any) => {
      body.value = value;
      return res;
    }),
  } as any;

  return { req, res, body };
}
