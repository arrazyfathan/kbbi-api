import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/app";
import { AppDependencies } from "../src/app-dependencies";
import HealthController from "../src/features/health/health.controller";
import IndonesianFigureController from "../src/features/figures/indonesian-figure.controller";
import KbbiController from "../src/features/kbbi/kbbi.controller";
import ProverbController from "../src/features/proverbs/proverb.controller";
import TranslateController from "../src/features/translate/translate.controller";
import WordController from "../src/features/word-visits/word.controller";
import { API_ERROR_CODES } from "../src/lib/api-error";
import { UpstreamHttpError } from "../src/lib/http-client";
import { HealthService } from "../src/features/health/health.service";

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
      expect.arrayContaining([
        "/health/live",
        "/health/ready",
        "/api/v1/search/[word]",
        "/api/v1/words/top",
        "/api/v1/proverb/search",
      ]),
    );
    expect(response.body.examples).toEqual(
      expect.arrayContaining([
        "http://localhost:3000/health/live",
        "http://localhost:3000/health/ready",
        "http://localhost:3000/api/v1/search/demokrasi",
        "http://localhost:3000/api/v1/words/top?limit=10",
      ]),
    );
  });

  it("returns liveness health without dependency checks", async () => {
    const response = await request(createApp()).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Process is alive",
      data: {
        alive: true,
      },
    });
  });

  it("returns ready when configured dependencies are healthy", async () => {
    testServices.healthService.ready.mockResolvedValueOnce({
      ready: true,
      dependencies: [
        {
          name: "supabase",
          status: "ok",
          required: true,
          host: "project.supabase.co",
          statusCode: 200,
          statusText: "OK",
        },
      ],
    });

    const response = await request(createApp()).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Application is ready",
      data: {
        ready: true,
        dependencies: [
          {
            name: "supabase",
            status: "ok",
            required: true,
            host: "project.supabase.co",
            statusCode: 200,
            statusText: "OK",
          },
        ],
      },
    });
  });

  it("returns not ready when a configured dependency fails", async () => {
    testServices.healthService.ready.mockResolvedValueOnce({
      ready: false,
      dependencies: [
        {
          name: "supabase",
          status: "failed",
          required: true,
          host: "project.supabase.co",
          statusCode: 503,
          statusText: "Service Unavailable",
          error: "upstream unavailable",
        },
      ],
    });

    const response = await request(createApp()).get("/health/ready").set("X-Request-Id", "ready-request-1");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      message: "Application is not ready",
      code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE,
      requestId: "ready-request-1",
      data: {
        ready: false,
        dependencies: [
          {
            name: "supabase",
            status: "failed",
            required: true,
            host: "project.supabase.co",
            statusCode: 503,
            statusText: "Service Unavailable",
          },
        ],
      },
      error: "upstream unavailable",
    });
  });

  it("keeps Supabase health behavior covered", async () => {
    testServices.healthService.supabaseDependency.mockResolvedValueOnce({
      name: "supabase",
      status: "failed",
      required: true,
      host: "project.supabase.co",
      statusCode: 503,
      statusText: "Service Unavailable",
      error: "upstream unavailable",
    });

    const response = await request(createApp()).get("/health/supabase").set("X-Request-Id", "supabase-request-1");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      message: "Supabase connection failed",
      code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE,
      requestId: "supabase-request-1",
      data: {
        connected: false,
        host: "project.supabase.co",
        status: 503,
        statusText: "Service Unavailable",
      },
      error: "upstream unavailable",
    });
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

  it("translates a word through the real route and middleware stack", async () => {
    testServices.translateService.translate.mockResolvedValueOnce(createTranslateResult());

    const response = await request(createApp()).get("/translate/Demokrasi?to=en");

    expect(response.status).toBe(200);
    expect(testServices.translateService.translate).toHaveBeenCalledWith("Demokrasi", "en");
    expect(response.body).toEqual({
      success: true,
      message: "Translation successful",
      data: createTranslateResult(),
    });
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

  it("serves equivalent domain routes under /api/v1", async () => {
    testServices.kbbiService.search.mockResolvedValueOnce([
      {
        headword: "demokrasi",
        definitions: [{ wordClass: "n[Nomina]", description: "pemerintahan rakyat" }],
      },
    ]);
    testServices.wordVisitService.trackWordVisit.mockResolvedValueOnce(12);
    testServices.wordVisitService.getTopVisitedWords.mockResolvedValueOnce([{ word: "demokrasi", visitorCount: 12 }]);
    testServices.proverbService.list.mockResolvedValueOnce(createPaginatedProverbResult());
    testServices.proverbService.search.mockResolvedValueOnce(createPaginatedProverbResult());
    testServices.proverbService.detail.mockResolvedValueOnce({
      text: "Abu saja tak hinggap",
      letter: "A",
      slug: "Abu_saja_tak_hinggap",
      sourceUrl: "https://id.wikiquote.org/wiki/Abu_saja_tak_hinggap",
      meaning: "sesuatu yang sangat bersih dan berkilau",
    });
    testServices.indonesianFigureService.list.mockResolvedValueOnce(createPaginatedFigureResult());
    testServices.indonesianFigureService.search.mockResolvedValueOnce(createPaginatedFigureResult());
    testServices.indonesianFigureService.detail.mockResolvedValueOnce({
      name: "Soekarno",
      slug: "Soekarno",
      sourceUrl: "https://id.wikiquote.org/wiki/Soekarno",
      photo: null,
      description: "Presiden pertama Republik Indonesia",
      quotes: ["Bangsa yang besar adalah bangsa yang menghargai jasa pahlawannya"],
    });
    testServices.translateService.translate.mockResolvedValueOnce(createTranslateResult());

    const app = createApp();

    await expectOk(request(app).get("/api/v1/search/Demokrasi").set("X-Visitor-Id", "client-1"));
    await expectOk(request(app).get("/api/v1/words/top?limit=1"));
    await expectOk(request(app).get("/api/v1/proverb?page=1&limit=20"));
    await expectOk(request(app).get("/api/v1/proverb/search?q=air"));
    await expectOk(request(app).get("/api/v1/proverb/Abu_saja_tak_hinggap"));
    await expectOk(request(app).get("/api/v1/figure?page=1&limit=10"));
    await expectOk(request(app).get("/api/v1/figure/search?q=soekarno"));
    await expectOk(request(app).get("/api/v1/figure/Soekarno"));
    await expectOk(request(app).get("/api/v1/translate/Demokrasi"));

    expect(testServices.kbbiService.search).toHaveBeenCalledWith("Demokrasi");
    expect(testServices.wordVisitService.trackWordVisit).toHaveBeenCalledWith("demokrasi", "client-1");
    expect(testServices.wordVisitService.getTopVisitedWords).toHaveBeenCalledWith(1);
    expect(testServices.proverbService.list).toHaveBeenCalledWith(1, 20);
    expect(testServices.proverbService.search).toHaveBeenCalledWith("air", 1, 20);
    expect(testServices.proverbService.detail).toHaveBeenCalledWith("Abu_saja_tak_hinggap");
    expect(testServices.indonesianFigureService.list).toHaveBeenCalledWith(1, 10, { includeDetails: false });
    expect(testServices.indonesianFigureService.search).toHaveBeenCalledWith("soekarno", 1, 20, {
      includeDetails: false,
    });
    expect(testServices.indonesianFigureService.detail).toHaveBeenCalledWith("Soekarno");
    expect(testServices.translateService.translate).toHaveBeenCalledWith("Demokrasi", "en");
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
    translateService: {
      translate: vi.fn(),
    },
    wordVisitService: {
      getTopVisitedWords: vi.fn(),
      trackWordVisit: vi.fn(),
    },
    healthService: {
      live: vi.fn(() => ({ alive: true })),
      ready: vi.fn(async () => ({
        ready: true,
        dependencies: [
          {
            name: "supabase" as const,
            status: "skipped" as const,
            required: false,
            host: null,
          },
        ],
      })),
      supabaseDependency: vi.fn(async () => ({
        name: "supabase" as const,
        status: "failed" as const,
        required: false,
        host: null,
        error: "Missing SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY",
      })),
    },
  };
}

function createTestDependencies(services: ReturnType<typeof createTestServices>): AppDependencies {
  return {
    controllers: {
      healthController: new HealthController(services.healthService as unknown as HealthService),
      indonesianFigureController: new IndonesianFigureController(services.indonesianFigureService),
      kbbiController: new KbbiController(services.kbbiService, services.wordVisitService),
      proverbController: new ProverbController(services.proverbService),
      translateController: new TranslateController(services.translateService),
      wordController: new WordController(services.wordVisitService),
    },
  };
}

async function expectOk(requestPromise: Promise<request.Response>) {
  const response = await requestPromise;

  expect(response.status).toBe(200);
}

function createTranslateResult() {
  return {
    word: "demokrasi",
    from: "id",
    to: "en",
    provider: "google",
    entries: [
      {
        headword: "demokrasi",
        definitions: [
          { wordClass: "n[Nomina]", description: "pemerintahan rakyat", translation: "people's government" },
        ],
      },
    ],
  };
}

function createPaginatedProverbResult() {
  return {
    source: "https://id.wikiquote.org/wiki/Peribahasa_Indonesia",
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    items: [
      {
        text: "Ada gula ada semut",
        letter: "A",
        slug: "Ada_gula_ada_semut",
        sourceUrl: "https://id.wikiquote.org/wiki/Ada_gula_ada_semut",
      },
    ],
  };
}

function createPaginatedFigureResult() {
  return {
    source: "https://id.wikiquote.org/wiki/Kategori:Tokoh_Indonesia",
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    items: [
      {
        name: "Soekarno",
        slug: "Soekarno",
        sourceUrl: "https://id.wikiquote.org/wiki/Soekarno",
      },
    ],
  };
}
