import path from "node:path";
import Ajv2020, { ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/app";
import { API_ERROR_CODES } from "../src/lib/api-error";
import { UpstreamHttpError } from "../src/lib/http-client";
import { createRateLimiter } from "../src/middlewares/rate-limit.middleware";
import { IndonesianFigureService } from "../src/services/indonesian-figure.service";
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
    list: vi.fn(),
    search: vi.fn(),
    detail: vi.fn(),
  },
}));

vi.mock("../src/services/indonesian-figure.service", () => ({
  IndonesianFigureService: {
    list: vi.fn(),
    search: vi.fn(),
    detail: vi.fn(),
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

describe("OpenAPI response contracts", () => {
  beforeAll(async () => {
    const { dereference } = await import("@apidevtools/json-schema-ref-parser");
    openApiSpec = (await dereference(path.resolve(process.cwd(), "docs/openapi.yaml"))) as OpenApiSpec;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates representative success responses against documented schemas", async () => {
    vi.mocked(KbbiService.search).mockResolvedValueOnce([
      {
        headword: "demokrasi",
        definitions: [{ wordClass: "n[Nomina]", description: "pemerintahan rakyat" }],
      },
    ]);
    vi.mocked(WordVisitService.trackWordVisit).mockResolvedValueOnce(12);
    vi.mocked(WordVisitService.getTopVisitedWords).mockResolvedValueOnce([{ word: "demokrasi", visitorCount: 12 }]);
    vi.mocked(ProverbService.search).mockResolvedValueOnce({
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
    vi.mocked(IndonesianFigureService.search).mockResolvedValueOnce({
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
    });

    const app = createApp();

    expectResponseToMatchContract(await request(app).get("/"), {
      method: "get",
      path: "/",
      status: 200,
    });
    expectResponseToMatchContract(await request(app).get("/search/Demokrasi").set("X-Visitor-Id", "client-1"), {
      method: "get",
      path: "/search/{word}",
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
  });

  it("validates documented validation and upstream error response contracts", async () => {
    vi.mocked(KbbiService.search).mockRejectedValueOnce(
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
  });
});

function createApp() {
  return new App().app;
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
