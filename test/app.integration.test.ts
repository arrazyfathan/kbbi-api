import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/app";
import { API_ERROR_CODES } from "../src/lib/api-error";
import { UpstreamHttpError } from "../src/lib/http-client";
import { KbbiService } from "../src/services/kbbi.service";
import { ProverbService } from "../src/services/proverb.service";
import { WordVisitService } from "../src/services/word-visit.service";

vi.mock("../src/services/kbbi.service", () => ({
  KbbiService: {
    search: vi.fn(),
  },
}));

vi.mock("../src/services/proverb.service", () => ({
  ProverbService: {
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
      getTopVisitedWords: vi.fn(),
      trackWordVisit: vi.fn(),
    },
  };
});

describe("Express app integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns root endpoint metadata", async () => {
    const response = await request(createApp()).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.body).toMatchObject({
      message: "Welcome to New KBBI API",
    });
    expect(response.body.endpoints).toEqual(
      expect.arrayContaining(["/search/[word]", "/words/top", "/proverb/search"]),
    );
    expect(response.body.examples).toEqual(
      expect.arrayContaining(["http://localhost:3000/search/demokrasi", "http://localhost:3000/words/top?limit=10"]),
    );
  });

  it("searches a word through the real route and middleware stack", async () => {
    vi.mocked(KbbiService.search).mockResolvedValueOnce([
      {
        headword: "demokrasi",
        definitions: [{ wordClass: "n[Nomina]", description: "pemerintahan rakyat" }],
      },
    ]);
    vi.mocked(WordVisitService.trackWordVisit).mockResolvedValueOnce(12);

    const response = await request(createApp()).get("/search/Demokrasi").set("X-Visitor-Id", "client-1");

    expect(response.status).toBe(200);
    expect(KbbiService.search).toHaveBeenCalledWith("Demokrasi");
    expect(WordVisitService.trackWordVisit).toHaveBeenCalledWith("demokrasi", "client-1");
    expect(response.body).toEqual({
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

  it("returns top visited words through HTTP", async () => {
    vi.mocked(WordVisitService.getTopVisitedWords).mockResolvedValueOnce([
      { word: "demokrasi", visitorCount: 12 },
      { word: "ajar", visitorCount: 8 },
    ]);

    const response = await request(createApp()).get("/words/top?limit=2");

    expect(response.status).toBe(200);
    expect(WordVisitService.getTopVisitedWords).toHaveBeenCalledWith(2);
    expect(response.body).toEqual({
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

  it("returns validation errors without calling the external-backed service", async () => {
    const response = await request(createApp()).get("/proverb/search");

    expect(response.status).toBe(400);
    expect(ProverbService.search).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      success: false,
      message: "Query parameter 'q' is required",
      code: API_ERROR_CODES.VALIDATION_ERROR,
      details: [
        {
          field: "q",
          location: "query",
          reason: "Required non-empty string",
        },
      ],
    });
  });

  it("returns a stable 404 response for unknown routes", async () => {
    const response = await request(createApp()).get("/unknown-route");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: "Endpoint not found",
      code: API_ERROR_CODES.NOT_FOUND,
    });
  });

  it("maps upstream failures to public HTTP errors", async () => {
    vi.mocked(KbbiService.search).mockRejectedValueOnce(
      new UpstreamHttpError("Upstream service failed", {
        statusCode: 502,
        upstreamStatus: 503,
      }),
    );

    const response = await request(createApp()).get("/search/gagal");

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      success: false,
      message: "Upstream service failed",
      code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE,
    });
    expect(WordVisitService.trackWordVisit).not.toHaveBeenCalled();
  });
});

function createApp() {
  return new App().app;
}
