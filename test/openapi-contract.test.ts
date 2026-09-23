import path from "node:path";
import Ajv2020, { ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
import { createRateLimiter } from "../src/middlewares/rate-limit.middleware";
import { HealthService } from "../src/features/health/health.service";
import AiWordStudyController from "../src/features/ai-word-study/ai-word-study.controller";
import { serviceUnavailableError, upstreamTimeoutError, upstreamUnavailableError } from "../src/lib/api-error";

type OpenApiResponse = {
  content?: {
    "application/json"?: {
      schema?: unknown;
    };
  };
};

type OpenApiSpec = {
  paths: Record<string, Record<string, { responses: Record<string, OpenApiResponse> }>>;
  components: {
    responses: Record<string, OpenApiResponse>;
    schemas: Record<string, unknown>;
  };
};

type ContractTarget = {
  method: string;
  path: string;
  status: number;
};

let openApiSpec: OpenApiSpec;
let testServices: ReturnType<typeof createTestServices>;

describe("OpenAPI response contracts", () => {
  beforeAll(async () => {
    const { dereference } = await import("@apidevtools/json-schema-ref-parser");
    openApiSpec = (await dereference(path.resolve(process.cwd(), "docs/openapi.yaml"))) as OpenApiSpec;
  });

  beforeEach(() => {
    testServices = createTestServices();
  });

  it("validates representative success responses against documented schemas", async () => {
    testServices.kbbiService.search.mockResolvedValueOnce([
      {
        headword: "demokrasi",
        definitions: [{ wordClass: "n[Nomina]", description: "pemerintahan rakyat" }],
      },
    ]);
    testServices.wordVisitService.trackWordVisit.mockResolvedValueOnce(12);
    testServices.wordVisitService.getTopVisitedWords.mockResolvedValueOnce([{ word: "demokrasi", visitorCount: 12 }]);
    testServices.wordVisitService.getTopVisitedWords.mockResolvedValueOnce([{ word: "demokrasi", visitorCount: 12 }]);
    testServices.proverbService.search.mockResolvedValueOnce({
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
    });
    testServices.proverbService.search.mockResolvedValueOnce({
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
    });
    testServices.indonesianFigureService.search.mockResolvedValueOnce({
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
          photo: null,
          description: null,
        },
      ],
    });
    testServices.indonesianFigureService.search.mockResolvedValueOnce({
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
          photo: null,
          description: null,
        },
      ],
    });
    testServices.translateService.translate.mockResolvedValueOnce({
      word: "demokrasi",
      translation: "democracy",
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
    });
    testServices.aiWordStudyService.generate.mockResolvedValueOnce(createWordStudyResult());
    testServices.aiWordStudyService.listProviders.mockReturnValueOnce({
      defaultProvider: "openai",
      providers: [{ id: "openai", defaultModel: "configured-model", models: ["configured-model"] }],
    });

    const app = createApp();

    expectResponseToMatchContract(await request(app).get("/"), {
      method: "get",
      path: "/",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/health/live"), {
      method: "get",
      path: "/health/live",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/health/ready"), {
      method: "get",
      path: "/health/ready",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/search/Demokrasi").set("X-Visitor-Id", "client-1"), {
      method: "get",
      path: "/search/{word}",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/translate/Demokrasi"), {
      method: "get",
      path: "/translate/{word}",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/words/top?limit=1"), {
      method: "get",
      path: "/words/top",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/proverb/search?q=gula"), {
      method: "get",
      path: "/proverb/search",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/figure/search?q=soekarno"), {
      method: "get",
      path: "/figure/search",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/api/v1/words/top?limit=1"), {
      method: "get",
      path: "/api/v1/words/top",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/api/v1/proverb/search?q=gula"), {
      method: "get",
      path: "/api/v1/proverb/search",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/api/v1/figure/search?q=soekarno"), {
      method: "get",
      path: "/api/v1/figure/search",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).post("/api/v1/ai/word-study").send(createWordStudyRequest()), {
      method: "post",
      path: "/api/v1/ai/word-study",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/api/v1/ai/providers"), {
      method: "get",
      path: "/api/v1/ai/providers",
      status: 200,
    });
  });

  it("validates documented validation and upstream error response contracts", async () => {
    testServices.kbbiService.search.mockRejectedValueOnce(
      new UpstreamHttpError("Upstream service failed", {
        statusCode: 502,
        upstreamStatus: 503,
      }),
    );

    const app = createApp();

    expectResponseToMatchContract(await request(app).get("/proverb/search"), {
      method: "get",
      path: "/proverb/search",
      status: 400,
    });
    expectResponseToMatchContract(await request(app).get("/search/gagal"), {
      method: "get",
      path: "/search/{word}",
      status: 502,
    });
    expectResponseToMatchContract(await request(app).get("/api/v1/proverb/search"), {
      method: "get",
      path: "/api/v1/proverb/search",
      status: 400,
    });

    expectResponseToMatchContract(await request(app).post("/api/v1/ai/word-study").send({}), {
      method: "post",
      path: "/api/v1/ai/word-study",
      status: 400,
    });

    for (const [error, status] of [
      [upstreamUnavailableError("AI generation is temporarily unavailable"), 502],
      [serviceUnavailableError("AI word study is not configured"), 503],
      [upstreamTimeoutError("OpenAI request timed out"), 504],
    ] as const) {
      testServices.aiWordStudyService.generate.mockRejectedValueOnce(error);
      expectResponseToMatchContract(await request(app).post("/api/v1/ai/word-study").send(createWordStudyRequest()), {
        method: "post",
        path: "/api/v1/ai/word-study",
        status,
      });
    }
  });

  it("validates app-level and rate-limit errors against reusable error schemas", async () => {
    const appLevelNotFound = await request(createApp()).get("/unknown-route").set("X-Request-Id", "client-request-404");
    expectSchemaToMatch("ErrorResponse", appLevelNotFound.body);

    const rateLimited = await request(createRateLimitedApp()).get("/limited").set("X-Request-Id", "client-request-429");

    expect(rateLimited.status).toBe(429);
    expect(rateLimited.body).toMatchObject({
      success: false,
      message: "Too many requests",
      code: API_ERROR_CODES.RATE_LIMITED,
      requestId: "client-request-429",
    });
    expectResponseComponentToMatch("RateLimited", rateLimited.body);
    expectSchemaToMatch("POST /api/v1/ai/word-study 429", rateLimited.body, () =>
      getResponseSchema({ method: "post", path: "/api/v1/ai/word-study", status: 429 }),
    );
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
    aiWordStudyService: {
      generate: vi.fn(),
      listProviders: vi.fn(),
    },
  };
}

function createTestDependencies(services: ReturnType<typeof createTestServices>): AppDependencies {
  return {
    controllers: {
      aiWordStudyController: new AiWordStudyController(services.aiWordStudyService),
      healthController: new HealthController(services.healthService as unknown as HealthService),
      indonesianFigureController: new IndonesianFigureController(services.indonesianFigureService),
      kbbiController: new KbbiController(services.kbbiService, services.wordVisitService),
      proverbController: new ProverbController(services.proverbService),
      translateController: new TranslateController(services.translateService),
      wordController: new WordController(services.wordVisitService),
    },
  };
}

function createWordStudyRequest() {
  return {
    word: "bahasa",
    language: "id",
    entries: [{ headword: "bahasa", definitions: [{ wordClass: "n", description: "sistem lambang bunyi" }] }],
  };
}

function createWordStudyResult() {
  return {
    explanation: "Penjelasan sederhana.",
    examples: ["Contoh pertama.", "Contoh kedua."],
    usageNotes: ["Catatan pertama.", "Catatan kedua."],
    relatedWords: ["berbahasa", "kebahasaan", "linguistik"],
    provider: "openai",
    model: "configured-model",
  };
}

function createRateLimitedApp() {
  const app = express();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 0 });

  app.use((req, _res, next) => {
    req.id = String(req.headers["x-request-id"] || "request-1");
    next();
  });
  app.get("/limited", limiter, (_req, res) => {
    res.status(200).json({ success: true });
  });

  return app;
}

function expectResponseToMatchContract(response: request.Response, target: ContractTarget) {
  expect(response.status).toBe(target.status);
  expectSchemaToMatch(`${target.method.toUpperCase()} ${target.path} ${target.status}`, response.body, () =>
    getResponseSchema(target),
  );
}

function expectResponseComponentToMatch(componentName: string, body: unknown) {
  expectSchemaToMatch(`components.responses.${componentName}`, body, () => {
    const response = openApiSpec.components.responses[componentName];

    return getJsonResponseSchema(response, `components.responses.${componentName}`);
  });
}

function expectSchemaToMatch(
  schemaName: string,
  body: unknown,
  getSchema: () => unknown = () => getComponentSchema(schemaName),
) {
  const validate = compileSchema(getSchema());

  expect(formatValidationErrors(schemaName, validate, body)).toBe("");
}

function getResponseSchema(target: ContractTarget) {
  const operation = openApiSpec.paths[target.path]?.[target.method];
  const response = operation?.responses[String(target.status)];

  return getJsonResponseSchema(response, `${target.method.toUpperCase()} ${target.path} ${target.status}`);
}

function getJsonResponseSchema(response: OpenApiResponse | undefined, label: string) {
  const schema = response?.content?.["application/json"]?.schema;

  if (!schema) {
    throw new Error(`Missing JSON response schema for ${label}`);
  }

  return schema;
}

function getComponentSchema(schemaName: string) {
  const schema = openApiSpec.components.schemas[schemaName];

  if (!schema) {
    throw new Error(`Missing component schema ${schemaName}`);
  }

  return schema;
}

function compileSchema(schema: unknown): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  return ajv.compile(schema);
}

function formatValidationErrors(schemaName: string, validate: ValidateFunction, body: unknown): string {
  if (validate(body)) {
    return "";
  }

  return `${schemaName} validation failed: ${JSON.stringify(validate.errors, null, 2)}`;
}
