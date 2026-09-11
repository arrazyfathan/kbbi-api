import request from "supertest";
import { describe, expect, it } from "vitest";
import App from "../src/app";
import { API_ERROR_CODES } from "../src/lib/api-error";

const body = {
  word: "bahasa",
  language: "id",
  entries: [{ headword: "bahasa", definitions: [{ wordClass: "n", description: "sistem lambang bunyi" }] }],
};

describe("AI word study route", () => {
  it("lists configured providers without requiring AI configuration", async () => {
    const response = await request(new App().app).get("/api/v1/ai/providers");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "AI providers fetched",
      data: { defaultProvider: null, providers: [] },
    });
  });

  it("is versioned, returns request IDs, and applies its dedicated rate limit", async () => {
    const app = new App().app;
    const versioned = await request(app).post("/api/v1/ai/word-study").set("X-Request-Id", "ai-request-1").send(body);
    expect(versioned.status).toBe(503);
    expect(versioned.body).toEqual({
      success: false,
      message: "AI word study is not configured",
      code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE,
      requestId: "ai-request-1",
    });

    const unversioned = await request(app).post("/ai/word-study").send(body);
    expect(unversioned.status).toBe(404);

    for (let index = 1; index < 10; index += 1) {
      expect((await request(app).post("/api/v1/ai/word-study").send(body)).status).toBe(503);
    }
    const limited = await request(app).post("/api/v1/ai/word-study").send(body);
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ success: false, code: API_ERROR_CODES.RATE_LIMITED });
  });
});
