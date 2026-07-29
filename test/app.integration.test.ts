import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/app";
import { AppDependencies } from "../src/app-dependencies";
import HealthController from "../src/controllers/health.controller";
import IndonesianFigureController from "../src/controllers/indonesian-figure.controller";
import KbbiController from "../src/controllers/kbbi.controller";
import ProverbController from "../src/controllers/proverb.controller";
import WordController from "../src/controllers/word.controller";
import { API_ERROR_CODES } from "../src/lib/api-error";
import { UpstreamHttpError } from "../src/lib/http-client";

let testServices: ReturnType<typeof createTestServices>;

describe("Express app integration", () => {
  beforeEach(() => {
    testServices = createTestServices();
  });

  it("returns root endpoint metadata", async () => {
    const response = await request(createApp()).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["x-request-id"]).toBeDefined();
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
    testServices.kbbiService.search.mockResolvedValueOnce([
      {
        headword: "demokrasi",
        definitions: [{ wordClass: "n[Nomina]", description: "pemerintahan rakyat" }],
      },
    ]);
    testServices.wordVisitService.trackWordVisit.mockResolvedValueOnce(12);

    const response = await request(createApp()).get("/search/Demokrasi").set("X-Visitor-Id", "client-1");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(testServices.kbbiService.search).toHaveBeenCalledWith("Demokrasi");
    expect(testServices.wordVisitService.trackWordVisit).toHaveBeenCalledWith("demokrasi", "client-1");
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

  it("preserves client-provided request IDs in response headers", async () => {
    testServices.wordVisitService.getTopVisitedWords.mockResolvedValueOnce([]);

    const response = await request(createApp()).get("/words/top?limit=2").set("X-Request-Id", "client-request-1");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("client-request-1");
  });

  it("returns top visited words through HTTP", async () => {
    testServices.wordVisitService.getTopVisitedWords.mockResolvedValueOnce([
      { word: "demokrasi", visitorCount: 12 },
      { word: "ajar", visitorCount: 8 },
    ]);

    const response = await request(createApp()).get("/words/top?limit=2");

    expect(response.status).toBe(200);
    expect(testServices.wordVisitService.getTopVisitedWords).toHaveBeenCalledWith(2);
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
    const requestId = response.headers["x-request-id"];

    expect(response.status).toBe(400);
    expect(requestId).toBeDefined();
    expect(testServices.proverbService.search).not.toHaveBeenCalled();
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
      requestId,
    });
  });

  it("returns a stable 404 response for unknown routes", async () => {
    const response = await request(createApp()).get("/unknown-route").set("X-Request-Id", "client-request-404");

    expect(response.status).toBe(404);
    expect(response.headers["x-request-id"]).toBe("client-request-404");
    expect(response.body).toEqual({
      success: false,
      message: "Endpoint not found",
      code: API_ERROR_CODES.NOT_FOUND,
      requestId: "client-request-404",
    });
  });

  it("maps upstream failures to public HTTP errors", async () => {
    testServices.kbbiService.search.mockRejectedValueOnce(
      new UpstreamHttpError("Upstream service failed", {
        statusCode: 502,
        upstreamStatus: 503,
      }),
    );

    const response = await request(createApp()).get("/search/gagal");
    const requestId = response.headers["x-request-id"];

    expect(response.status).toBe(502);
    expect(requestId).toBeDefined();
    expect(response.body).toEqual({
      success: false,
      message: "Upstream service failed",
      code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE,
      requestId,
    });
    expect(testServices.wordVisitService.trackWordVisit).not.toHaveBeenCalled();
  });
});

function createApp() {
  return new App(createTestDependencies(testServices)).app;
}

function createTestServices() {
  return {
    indonesianFigureService: {
      list: vi.fn(),
      search: vi.fn(),
      detail: vi.fn(),
    },
    kbbiService: {
      search: vi.fn(),
    },
    proverbService: {
      list: vi.fn(),
      search: vi.fn(),
      detail: vi.fn(),
    },
    wordVisitService: {
      getTopVisitedWords: vi.fn(),
      trackWordVisit: vi.fn(),
    },
  };
}

function createTestDependencies(services: ReturnType<typeof createTestServices>): AppDependencies {
  return {
    controllers: {
      healthController: HealthController,
      indonesianFigureController: new IndonesianFigureController(services.indonesianFigureService),
      kbbiController: new KbbiController(services.kbbiService, services.wordVisitService),
      proverbController: new ProverbController(services.proverbService),
      wordController: new WordController(services.wordVisitService),
    },
  };
}
