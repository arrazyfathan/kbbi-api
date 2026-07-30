import { beforeEach, describe, expect, it, vi } from "vitest";
import KbbiController from "../src/features/kbbi/kbbi.controller";
import { API_ERROR_CODES } from "../src/lib/api-error";

describe("KbbiController.search", () => {
  let kbbiService: { search: ReturnType<typeof vi.fn> };
  let wordVisitService: { trackWordVisit: ReturnType<typeof vi.fn> };
  let controller: KbbiController;

  beforeEach(() => {
    kbbiService = { search: vi.fn() };
    wordVisitService = { trackWordVisit: vi.fn() };
    controller = new KbbiController(kbbiService, wordVisitService);
  });

  it("returns entries with visitor count when a visitor id is provided", async () => {
    kbbiService.search.mockResolvedValueOnce([
      {
        headword: "demokrasi",
        definitions: [{ wordClass: "n[Nomina]", description: "pemerintahan rakyat" }],
      },
    ]);
    wordVisitService.trackWordVisit.mockResolvedValueOnce(12);

    const { req, res, body } = createRequestResponse({
      params: { word: " Demokrasi " },
      headers: { "x-visitor-id": "mobile-visitor-1" },
    });

    await controller.search(req, res);

    expect(kbbiService.search).toHaveBeenCalledWith("Demokrasi");
    expect(wordVisitService.trackWordVisit).toHaveBeenCalledWith("demokrasi", "mobile-visitor-1");
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
    kbbiService.search.mockResolvedValueOnce([
      {
        headword: "ajar",
        definitions: [{ wordClass: "v[verba]", description: "petunjuk" }],
      },
    ]);
    wordVisitService.trackWordVisit.mockRejectedValueOnce(new Error("Supabase unavailable"));

    const { req, res, body } = createRequestResponse({
      params: { word: "ajar" },
      headers: { "x-visitor-id": "mobile-visitor-1" },
    });

    await controller.search(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(body.value.data.visitorCount).toBeNull();
  });

  it("returns visitorCount null when no visitor id is provided", async () => {
    kbbiService.search.mockResolvedValueOnce([
      {
        headword: "ajar",
        definitions: [{ wordClass: "v[verba]", description: "petunjuk" }],
      },
    ]);
    wordVisitService.trackWordVisit.mockResolvedValueOnce(null);

    const { req, res, body } = createRequestResponse({
      params: { word: "ajar" },
    });

    await controller.search(req, res);

    expect(wordVisitService.trackWordVisit).toHaveBeenCalledWith("ajar", undefined);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body.value.data.visitorCount).toBeNull();
  });

  it("does not track visits for words that are not found", async () => {
    kbbiService.search.mockResolvedValueOnce(null);

    const { req, res } = createRequestResponse({
      params: { word: "notfound" },
      headers: { "x-visitor-id": "mobile-visitor-1" },
    });

    await expect(controller.search(req, res)).rejects.toMatchObject({
      statusCode: 404,
      code: API_ERROR_CODES.NOT_FOUND,
      message: "Word not found",
    });

    expect(wordVisitService.trackWordVisit).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 when word is blank", async () => {
    const { req, res } = createRequestResponse({
      params: { word: "   " },
    });

    await expect(controller.search(req, res)).rejects.toMatchObject({
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

    expect(kbbiService.search).not.toHaveBeenCalled();
    expect(wordVisitService.trackWordVisit).not.toHaveBeenCalled();
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
