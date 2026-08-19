import { beforeEach, describe, expect, it, vi } from "vitest";
import TranslateController from "../src/features/translate/translate.controller";
import { API_ERROR_CODES } from "../src/lib/api-error";

describe("TranslateController.translate", () => {
  let translateService: { translate: ReturnType<typeof vi.fn> };
  let controller: TranslateController;

  beforeEach(() => {
    translateService = { translate: vi.fn() };
    controller = new TranslateController(translateService);
  });

  it("returns translated entries with the default target language", async () => {
    translateService.translate.mockResolvedValueOnce({
      word: "demokrasi",
      from: "id",
      to: "en",
      entries: [
        {
          headword: "demokrasi",
          definitions: [
            { wordClass: "n[Nomina]", description: "pemerintahan rakyat", translation: "people's government" },
          ],
        },
      ],
    });

    const { req, res, body } = createRequestResponse({ params: { word: "demokrasi" }, query: {} });

    await controller.translate(req, res);

    expect(translateService.translate).toHaveBeenCalledWith("demokrasi", "en");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body.value).toEqual({
      success: true,
      message: "Translation successful",
      data: {
        word: "demokrasi",
        from: "id",
        to: "en",
        entries: [
          {
            headword: "demokrasi",
            definitions: [
              { wordClass: "n[Nomina]", description: "pemerintahan rakyat", translation: "people's government" },
            ],
          },
        ],
      },
    });
  });

  it("passes the target language from the to query parameter", async () => {
    translateService.translate.mockResolvedValueOnce({
      word: "demokrasi",
      from: "id",
      to: "ms",
      entries: [],
    });

    const { req, res, body } = createRequestResponse({ params: { word: "demokrasi" }, query: { to: "MS" } });

    await controller.translate(req, res);

    expect(translateService.translate).toHaveBeenCalledWith("demokrasi", "ms");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body.value.data.to).toBe("ms");
  });

  it("returns 404 when the word is not found in KBBI", async () => {
    translateService.translate.mockResolvedValueOnce(null);

    const { req, res } = createRequestResponse({ params: { word: "notfound" }, query: {} });

    await expect(controller.translate(req, res)).rejects.toMatchObject({
      statusCode: 404,
      code: API_ERROR_CODES.NOT_FOUND,
      message: "Word not found",
    });

    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 when the word is blank", async () => {
    const { req, res } = createRequestResponse({ params: { word: "   " }, query: {} });

    await expect(controller.translate(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message: "Parameter 'word' is required and must be a string",
    });

    expect(translateService.translate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 when the to query parameter is not an ISO language code", async () => {
    const { req, res } = createRequestResponse({ params: { word: "demokrasi" }, query: { to: "not-a-code" } });

    await expect(controller.translate(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message: "Query parameter 'to' must be an ISO language code",
      details: [
        {
          field: "to",
          location: "query",
          reason: "Must be a valid ISO 639-1/639-2 language code",
        },
      ],
    });

    expect(translateService.translate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

function createRequestResponse(input: { params: Record<string, string>; query: Record<string, unknown> }) {
  const body: { value?: any } = {};
  const req = {
    params: input.params,
    query: input.query,
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
