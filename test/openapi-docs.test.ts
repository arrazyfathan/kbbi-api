import { readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import App from "../src/app";

const openApiSpec = YAML.parse(readFileSync(path.resolve(process.cwd(), "docs/openapi.yaml"), "utf8"));

describe("OpenAPI documentation", () => {
  it("serves Swagger UI", async () => {
    const response = await request(createApp()).get("/docs/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain("Swagger UI");
  });

  it("serves the raw OpenAPI YAML document", async () => {
    const response = await request(createApp()).get("/docs/openapi.yaml");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/yaml");
    expect(response.text).toContain("openapi: 3.1.0");
  });

  it("documents every registered API endpoint", () => {
    expect(openApiSpec.servers).toContainEqual({
      url: "/",
      description: "Same origin as the documentation page.",
    });
    expect(Object.keys(openApiSpec.paths)).toEqual(
      expect.arrayContaining([
        "/",
        "/health/supabase",
        "/search/{word}",
        "/words/top",
        "/proverb",
        "/proverb/search",
        "/proverb/{slug}",
        "/figure",
        "/figure/search",
        "/figure/{slug}",
      ]),
    );
  });

  it("documents visitor tracking, pagination, and reusable errors", () => {
    const searchParameters = openApiSpec.paths["/search/{word}"].get.parameters;
    const rootParameters = openApiSpec.paths["/"].get.parameters;
    const paginatedProverbData = openApiSpec.components.schemas.PaginatedProverbList.properties.pagination["$ref"];
    const paginatedFigureData =
      openApiSpec.components.schemas.PaginatedIndonesianFigureList.properties.pagination["$ref"];
    const validationErrorSchema =
      openApiSpec.components.responses.ValidationError.content["application/json"].schema["$ref"];

    expect(rootParameters).toContainEqual({ $ref: "#/components/parameters/RequestIdHeader" });
    expect(searchParameters).toContainEqual({ $ref: "#/components/parameters/VisitorIdHeader" });
    expect(searchParameters).toContainEqual({ $ref: "#/components/parameters/RequestIdHeader" });
    expect(openApiSpec.components.schemas.ErrorResponse.required).toContain("requestId");
    expect(paginatedProverbData).toBe("#/components/schemas/Pagination");
    expect(paginatedFigureData).toBe("#/components/schemas/Pagination");
    expect(validationErrorSchema).toBe("#/components/schemas/ErrorResponse");
  });
});

function createApp() {
  return new App().app;
}
