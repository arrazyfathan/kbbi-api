import { beforeEach, describe, expect, it, vi } from "vitest";
import WordController from "../src/controllers/word.controller";
import { WordVisitService } from "../src/services/word-visit.service";

vi.mock("../src/services/word-visit.service", async () => {
  const actual = await vi.importActual<typeof import("../src/services/word-visit.service")>("../src/services/word-visit.service");

  return {
    ...actual,
    WordVisitService: {
      getTopVisitedWords: vi.fn(),
    },
  };
});

describe("WordController.topVisited", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns top visited words with the requested limit", async () => {
    vi.mocked(WordVisitService.getTopVisitedWords).mockResolvedValueOnce([
      { word: "demokrasi", visitorCount: 12 },
      { word: "ajar", visitorCount: 8 },
    ]);

    const { req, res, body } = createRequestResponse({ query: { limit: "5" } });

    await WordController.topVisited(req, res);

    expect(WordVisitService.getTopVisitedWords).toHaveBeenCalledWith(5);
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
    vi.mocked(WordVisitService.getTopVisitedWords).mockResolvedValueOnce([]);

    const { req, res } = createRequestResponse({ query: { limit: "invalid" } });

    await WordController.topVisited(req, res);

    expect(WordVisitService.getTopVisitedWords).toHaveBeenCalledWith(10);
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
