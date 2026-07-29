import { beforeEach, describe, expect, it, vi } from "vitest";
import ProverbController from "../src/controllers/proverb.controller";
import { API_ERROR_CODES } from "../src/lib/api-error";

describe("ProverbController", () => {
  let proverbService: {
    list: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    detail: ReturnType<typeof vi.fn>;
  };
  let controller: ProverbController;

  beforeEach(() => {
    proverbService = {
      list: vi.fn(),
      search: vi.fn(),
      detail: vi.fn(),
    };
    controller = new ProverbController(proverbService);
  });

  it("passes validated pagination to list", async () => {
    proverbService.list.mockResolvedValueOnce(createPaginatedResult());

    const { req, res } = createRequestResponse({ query: { page: "2", limit: "100" } });

    await controller.list(req, res);

    expect(proverbService.list).toHaveBeenCalledWith(2, 100);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects invalid list pagination before calling the service", async () => {
    const { req, res } = createRequestResponse({ query: { page: "0" } });

    await expect(controller.list(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message: "Query parameter 'page' must be a positive integer",
    });

    expect(proverbService.list).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects proverb limits above 100", async () => {
    const { req, res } = createRequestResponse({ query: { limit: "101" } });

    await expect(controller.list(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message: "Query parameter 'limit' must be a positive integer and must be less than or equal to 100",
    });

    expect(proverbService.list).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("passes trimmed search query and validated pagination to search", async () => {
    proverbService.search.mockResolvedValueOnce(createPaginatedResult());

    const { req, res } = createRequestResponse({ query: { q: " air ", page: "3", limit: "10" } });

    await controller.search(req, res);

    expect(proverbService.search).toHaveBeenCalledWith("air", 3, 10);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("still returns 400 when q is missing", async () => {
    const { req, res } = createRequestResponse({ query: {} });

    await expect(controller.search(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message: "Query parameter 'q' is required",
    });

    expect(proverbService.search).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("passes normalized slugs to detail", async () => {
    proverbService.detail.mockResolvedValueOnce({
      text: "Ada gula ada semut",
      letter: "A",
      slug: "Ada_gula_ada_semut",
      sourceUrl: "https://example.com/Ada_gula_ada_semut",
      meaning: null,
    });

    const { req, res } = createRequestResponse({ params: { slug: " Ada gula ada semut " } });

    await controller.detail(req, res);

    expect(proverbService.detail).toHaveBeenCalledWith("Ada_gula_ada_semut");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("throws a not found error when proverb detail is missing", async () => {
    proverbService.detail.mockResolvedValueOnce(null);

    const { req, res } = createRequestResponse({ params: { slug: "missing" } });

    await expect(controller.detail(req, res)).rejects.toMatchObject({
      statusCode: 404,
      code: API_ERROR_CODES.NOT_FOUND,
      message: "Proverb not found",
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
