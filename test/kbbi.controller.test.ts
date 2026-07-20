import { beforeEach, describe, expect, it, vi } from "vitest";
import KbbiController from "../src/controllers/kbbi.controller";
import { API_ERROR_CODES } from "../src/lib/api-error";
import { KbbiService } from "../src/services/kbbi.service";
import { WordVisitService } from "../src/services/word-visit.service";

vi.mock("../src/services/kbbi.service", () => ({
  KbbiService: {
    search: vi.fn(),
  },
}));

vi.mock("../src/services/word-visit.service", async () => {
  const actual = await vi.importActual<typeof import("../src/services/word-visit.service")>(
    "../src/services/word-visit.service",
  );

  return {
    ...actual,
    WordVisitService: {
      trackWordVisit: vi.fn(),
    },
  };
});

describe("KbbiController.search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns entries with visitor count when a visitor id is provided", async () => {
    vi.mocked(KbbiService.search).mockResolvedValueOnce([
      {
        headword: "demokrasi",
        definitions: [{ wordClass: "n[Nomina]", description: "pemerintahan rakyat" }],
      },
    ]);
    vi.mocked(WordVisitService.trackWordVisit).mockResolvedValueOnce(12);

    const { req, res, body } = createRequestResponse({
      params: { word: " Demokrasi " },
      headers: { "x-visitor-id": "mobile-visitor-1" },
    });

    await KbbiController.search(req, res);

    expect(KbbiService.search).toHaveBeenCalledWith("Demokrasi");
    expect(WordVisitService.trackWordVisit).toHaveBeenCalledWith("demokrasi", "mobile-visitor-1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body.value).toEqual({
      success: true,
      message: "Search successful",
      data: {
        word: "demokrasi",
        visitorCount: 12,
        entries: [
          {
            headword: "demokrasi",
            definitions: [{ wordClass: "n[Nomina]", description: "pemerintahan rakyat" }],
          },
        ],
      },
    });
  });

  it("returns visitorCount null when tracking fails", async () => {
    vi.mocked(KbbiService.search).mockResolvedValueOnce([
      {
        headword: "ajar",
        definitions: [{ wordClass: "v[verba]", description: "petunjuk" }],
      },
    ]);
    vi.mocked(WordVisitService.trackWordVisit).mockRejectedValueOnce(new Error("Supabase unavailable"));

    const { req, res, body } = createRequestResponse({
      params: { word: "ajar" },
      headers: { "x-visitor-id": "mobile-visitor-1" },
    });

    await KbbiController.search(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(body.value.data.visitorCount).toBeNull();
  });

  it("returns visitorCount null when no visitor id is provided", async () => {
    vi.mocked(KbbiService.search).mockResolvedValueOnce([
      {
        headword: "ajar",
        definitions: [{ wordClass: "v[verba]", description: "petunjuk" }],
      },
    ]);
    vi.mocked(WordVisitService.trackWordVisit).mockResolvedValueOnce(null);

    const { req, res, body } = createRequestResponse({
      params: { word: "ajar" },
    });

    await KbbiController.search(req, res);

    expect(WordVisitService.trackWordVisit).toHaveBeenCalledWith("ajar", undefined);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body.value.data.visitorCount).toBeNull();
  });

  it("does not track visits for words that are not found", async () => {
    vi.mocked(KbbiService.search).mockResolvedValueOnce(null);

    const { req, res } = createRequestResponse({
      params: { word: "notfound" },
      headers: { "x-visitor-id": "mobile-visitor-1" },
    });

    await expect(KbbiController.search(req, res)).rejects.toMatchObject({
      statusCode: 404,
      code: API_ERROR_CODES.NOT_FOUND,
      message: "Word not found",
    });

    expect(WordVisitService.trackWordVisit).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 when word is blank", async () => {
    const { req, res } = createRequestResponse({
      params: { word: "   " },
    });

    await expect(KbbiController.search(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message: "Parameter 'word' is required and must be a string",
      details: [
        {
          field: "word",
          location: "params",
          reason: "Required non-empty string",
        },
      ],
    });

    expect(KbbiService.search).not.toHaveBeenCalled();
    expect(WordVisitService.trackWordVisit).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

function createRequestResponse(input: { params: Record<string, string>; headers?: Record<string, string> }) {
  const body: { value?: any } = {};
  const req = {
    params: input.params,
    headers: input.headers || {},
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
