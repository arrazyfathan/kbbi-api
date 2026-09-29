import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  insert: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("../src/config", () => ({
  default: {
    aiProviders: [],
    defaultAiProvider: undefined,
    supabaseServiceRoleKey: "server-key",
    upstream: { openAiTimeoutMs: 1000 },
    rateLimit: { ai: { windowMs: 900000, max: 10 } },
  },
}));
vi.mock("../src/config/supabase", () => ({
  supabase: { rpc: mocks.rpc, from: () => ({ insert: mocks.insert }) },
}));
vi.mock("../src/features/ai-word-study/openai-word-study.provider", () => ({
  AiProviderError: class AiProviderError extends Error {},
  createOpenAiCompatibleWordStudyProvider: (name: string, _key: string, models: string[], defaultModel: string) => ({
    name,
    models,
    defaultModel,
    generate: mocks.generate,
  }),
}));

import { ManagedAiWordStudyService } from "../src/features/ai-word-study/managed-ai";

const providers = [
  {
    id: "first",
    api_key: "hidden",
    base_url: "https://example.com/v1",
    models: ["one"],
    default_model: "one",
    is_default: false,
  },
  {
    id: "second",
    api_key: "hidden",
    base_url: "https://example.org/v1",
    models: ["two"],
    default_model: "two",
    is_default: true,
  },
];

describe("managed AI provider settings", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.insert.mockReset();
    mocks.generate.mockReset();
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "get_runtime_ai_providers" ? { data: providers, error: null } : { data: true, error: null },
    );
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("publishes only database-enabled providers and their default without credentials", async () => {
    const catalog = await new ManagedAiWordStudyService().listProviders();
    expect(catalog).toEqual({
      defaultProvider: "second",
      providers: [
        { id: "first", models: ["one"], defaultModel: "one" },
        { id: "second", models: ["two"], defaultModel: "two" },
      ],
    });
    expect(JSON.stringify(catalog)).not.toContain("hidden");
  });

  it("checks the daily budget before calling the selected provider", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "consume_ai_budget" ? { data: false, error: null } : { data: providers, error: null },
    );
    await expect(
      new ManagedAiWordStudyService().generate({
        word: "ajar",
        language: "id",
        entries: [{ headword: "ajar", definitions: [{ wordClass: "v", description: "belajar" }] }],
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
