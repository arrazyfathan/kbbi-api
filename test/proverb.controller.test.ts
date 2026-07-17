import { beforeEach, describe, expect, it, vi } from "vitest";
import ProverbController from "../src/controllers/proverb.controller";
import { ProverbService } from "../src/services/proverb.service";

vi.mock("../src/services/proverb.service", () => ({
  ProverbService: {
    list: vi.fn(),
    search: vi.fn(),
    detail: vi.fn(),
  },
}));

describe("ProverbController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes validated pagination to list", async () => {
    vi.mocked(ProverbService.list).mockResolvedValueOnce(createPaginatedResult());

    const { req, res } = createRequestResponse({ query: { page: "2", limit: "100" } });

    await ProverbController.list(req, res);

    expect(ProverbService.list).toHaveBeenCalledWith(2, 100);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects invalid list pagination before calling the service", async () => {
    const { req, res, body } = createRequestResponse({ query: { page: "0" } });

    await ProverbController.list(req, res);

    expect(ProverbService.list).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(body.value).toEqual({
      success: false,
      message: "Query parameter 'page' must be a positive integer",
    });
  });

  it("rejects proverb limits above 100", async () => {
    const { req, res, body } = createRequestResponse({ query: { limit: "101" } });

    await ProverbController.list(req, res);

    expect(ProverbService.list).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(body.value).toEqual({
      success: false,
      message: "Query parameter 'limit' must be a positive integer and must be less than or equal to 100",
    });
  });

  it("passes trimmed search query and validated pagination to search", async () => {
    vi.mocked(ProverbService.search).mockResolvedValueOnce(createPaginatedResult());

    const { req, res } = createRequestResponse({ query: { q: " air ", page: "3", limit: "10" } });

    await ProverbController.search(req, res);

    expect(ProverbService.search).toHaveBeenCalledWith("air", 3, 10);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("still returns 400 when q is missing", async () => {
    const { req, res, body } = createRequestResponse({ query: {} });

    await ProverbController.search(req, res);

    expect(ProverbService.search).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(body.value).toEqual({
      success: false,
      message: "Query parameter 'q' is required",
    });
  });

  it("passes normalized slugs to detail", async () => {
    vi.mocked(ProverbService.detail).mockResolvedValueOnce({
      text: "Ada gula ada semut",
      letter: "A",
      slug: "Ada_gula_ada_semut",
      sourceUrl: "https://example.com/Ada_gula_ada_semut",
      meaning: null,
    });

    const { req, res } = createRequestResponse({ params: { slug: " Ada gula ada semut " } });

    await ProverbController.detail(req, res);

    expect(ProverbService.detail).toHaveBeenCalledWith("Ada_gula_ada_semut");
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
