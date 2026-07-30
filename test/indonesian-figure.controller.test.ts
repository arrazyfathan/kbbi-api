import { beforeEach, describe, expect, it, vi } from "vitest";
import IndonesianFigureController from "../src/features/figures/indonesian-figure.controller";
import { API_ERROR_CODES } from "../src/lib/api-error";

describe("IndonesianFigureController", () => {
  let indonesianFigureService: {
    list: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    detail: ReturnType<typeof vi.fn>;
  };
  let controller: IndonesianFigureController;

  beforeEach(() => {
    indonesianFigureService = {
      list: vi.fn(),
      search: vi.fn(),
      detail: vi.fn(),
    };
    controller = new IndonesianFigureController(indonesianFigureService);
  });

  it("passes validated pagination to list", async () => {
    indonesianFigureService.list.mockResolvedValueOnce(createPaginatedResult());

    const { req, res } = createRequestResponse({ query: { page: "2", limit: "50" } });

    await controller.list(req, res);

    expect(indonesianFigureService.list).toHaveBeenCalledWith(2, 50, { includeDetails: false });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("passes includeDetails to list when requested", async () => {
    indonesianFigureService.list.mockResolvedValueOnce(createPaginatedResult());

    const { req, res } = createRequestResponse({ query: { includeDetails: "true" } });

    await controller.list(req, res);

    expect(indonesianFigureService.list).toHaveBeenCalledWith(1, 20, { includeDetails: true });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects invalid list pagination before calling the service", async () => {
    const { req, res } = createRequestResponse({ query: { limit: "abc" } });

    await expect(controller.list(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message: "Query parameter 'limit' must be a positive integer and must be less than or equal to 50",
    });

    expect(indonesianFigureService.list).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects figure limits above 50", async () => {
    const { req, res } = createRequestResponse({ query: { limit: "51" } });

    await expect(controller.list(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message: "Query parameter 'limit' must be a positive integer and must be less than or equal to 50",
    });

    expect(indonesianFigureService.list).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("passes trimmed search query and validated pagination to search", async () => {
    indonesianFigureService.search.mockResolvedValueOnce(createPaginatedResult());

    const { req, res } = createRequestResponse({ query: { q: " soekarno ", page: "1", limit: "5" } });

    await controller.search(req, res);

    expect(indonesianFigureService.search).toHaveBeenCalledWith("soekarno", 1, 5, { includeDetails: false });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("passes includeDetails to search when requested", async () => {
    indonesianFigureService.search.mockResolvedValueOnce(createPaginatedResult());

    const { req, res } = createRequestResponse({ query: { q: "soekarno", includeDetails: "true" } });

    await controller.search(req, res);

    expect(indonesianFigureService.search).toHaveBeenCalledWith("soekarno", 1, 20, { includeDetails: true });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("still returns 400 when q is blank", async () => {
    const { req, res } = createRequestResponse({ query: { q: "   " } });

    await expect(controller.search(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message: "Query parameter 'q' is required",
    });

    expect(indonesianFigureService.search).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("passes normalized slugs to detail", async () => {
    indonesianFigureService.detail.mockResolvedValueOnce({
      name: "Cut Nyak Dien",
      slug: "Cut_Nyak_Dien",
      sourceUrl: "https://example.com/Cut_Nyak_Dien",
      photo: null,
      description: null,
      quotes: null,
    });

    const { req, res } = createRequestResponse({ params: { slug: " Cut Nyak Dien " } });

    await controller.detail(req, res);

    expect(indonesianFigureService.detail).toHaveBeenCalledWith("Cut_Nyak_Dien");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("throws a not found error when figure detail is missing", async () => {
    indonesianFigureService.detail.mockResolvedValueOnce(null);

    const { req, res } = createRequestResponse({ params: { slug: "missing" } });

    await expect(controller.detail(req, res)).rejects.toMatchObject({
      statusCode: 404,
      code: API_ERROR_CODES.NOT_FOUND,
      message: "Indonesian figure not found",
    });

    expect(res.status).not.toHaveBeenCalled();
  });
});

function createPaginatedResult() {
  return {
    source: "https://example.com",
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    items: [],
  };
}

function createRequestResponse(input: { query?: Record<string, unknown>; params?: Record<string, string> }) {
  const body: { value?: any } = {};
  const req = {
    query: input.query || {},
    params: input.params || {},
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
