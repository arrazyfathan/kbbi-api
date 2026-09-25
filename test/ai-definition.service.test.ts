import { describe, expect, it, vi } from "vitest";
import { AiDefinitionService } from "../src/features/kbbi/ai-definition.service";

describe("AiDefinitionService", () => {
  it("returns a requested headword and validated definitions", async () => {
    const provider = {
      generate: vi.fn(async () => ({
        found: true,
        definitions: [{ wordClass: " n[Nomina] ", description: " makna baru " }],
      })),
    };

    await expect(new AiDefinitionService(provider).generate("KataBaru")).resolves.toEqual([
      { headword: "katabaru", definitions: [{ wordClass: "n[Nomina]", description: "makna baru" }] },
    ]);
  });

  it.each([
    { found: false, definitions: [] },
    { found: true, definitions: [] },
    { found: true, definitions: [{ wordClass: "n[Nomina]", description: " " }] },
    { found: true, definitions: [{ wordClass: "n[Nomina]", description: "meaning", injected: true }] },
    {
      found: true,
      definitions: [
        { wordClass: "n[Nomina]", description: "first meaning" },
        { wordClass: "v[Verba]", description: "invented meaning" },
      ],
    },
  ])("returns null for unusable AI content", async (content) => {
    const provider = { generate: vi.fn(async () => content) };
    await expect(new AiDefinitionService(provider).generate("unknown")).resolves.toBeNull();
  });

  it("does not call AI without a configured provider", async () => {
    await expect(new AiDefinitionService().generate("unknown")).resolves.toBeNull();
  });
});
