import { beforeEach, describe, expect, it, vi } from "vitest";
import IndonesianFigureController from "../src/controllers/indonesian-figure.controller";
import { IndonesianFigureService } from "../src/services/indonesian-figure.service";

vi.mock("../src/services/indonesian-figure.service", () => ({
  IndonesianFigureService: {
    list: vi.fn(),
    search: vi.fn(),
    detail: vi.fn(),
  },
}));

describe("IndonesianFigureController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes validated pagination to list", async () => {
    vi.mocked(IndonesianFigureService.list).mockResolvedValueOnce(createPaginatedResult());

    const { req, res } = createRequestResponse({ query: { page: "2", limit: "50" } });

    await IndonesianFigureController.list(req, res);

    expect(IndonesianFigureService.list).toHaveBeenCalledWith(2, 50);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects invalid list pagination before calling the service", async () => {
    const { req, res, body } = createRequestResponse({ query: { limit: "abc" } });

    await IndonesianFigureController.list(req, res);

    expect(IndonesianFigureService.list).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(body.value).toEqual({
      success: false,
      message: "Query parameter 'limit' must be a positive integer and must be less than or equal to 50",
    });
  });

  it("rejects figure limits above 50", async () => {
    const { req, res, body } = createRequestResponse({ query: { limit: "51" } });

    await IndonesianFigureController.list(req, res);

    expect(IndonesianFigureService.list).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(body.value).toEqual({
      success: false,
      message: "Query parameter 'limit' must be a positive integer and must be less than or equal to 50",
    });
  });

  it("passes trimmed search query and validated pagination to search", async () => {
    vi.mocked(IndonesianFigureService.search).mockResolvedValueOnce(createPaginatedResult());

    const { req, res } = createRequestResponse({ query: { q: " soekarno ", page: "1", limit: "5" } });

    await IndonesianFigureController.search(req, res);

    expect(IndonesianFigureService.search).toHaveBeenCalledWith("soekarno", 1, 5);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("still returns 400 when q is blank", async () => {
    const { req, res, body } = createRequestResponse({ query: { q: "   " } });

    await IndonesianFigureController.search(req, res);

    expect(IndonesianFigureService.search).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(body.value).toEqual({
      success: false,
      message: "Query parameter 'q' is required",
    });
  });

  it("passes normalized slugs to detail", async () => {
    vi.mocked(IndonesianFigureService.detail).mockResolvedValueOnce({
      name: "Cut Nyak Dien",
      slug: "Cut_Nyak_Dien",
      sourceUrl: "https://example.com/Cut_Nyak_Dien",
      photo: null,
      description: null,
      quotes: null,
    });

    const { req, res } = createRequestResponse({ params: { slug: " Cut Nyak Dien " } });

    await IndonesianFigureController.detail(req, res);

    expect(IndonesianFigureService.detail).toHaveBeenCalledWith("Cut_Nyak_Dien");
    expect(res.status).toHaveBeenCalledWith(200);
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
