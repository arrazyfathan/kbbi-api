import { describe, expect, it, vi } from "vitest";
import { AiProverbMeaningService } from "../src/features/proverbs/ai-proverb-meaning.service";

describe("AiProverbMeaningService", () => {
  it("returns a validated meaning", async () => {
    const service = new AiProverbMeaningService({
      generate: vi.fn().mockResolvedValue({ found: true, meaning: "Makna ringkas" }),
    });
    await expect(service.generate("Ada gula ada semut")).resolves.toBe("Makna ringkas");
  });

  it("declines unknown proverbs and malformed output", async () => {
    const decline = new AiProverbMeaningService({
      generate: vi.fn().mockResolvedValue({ found: false, meaning: null }),
    });
    const malformed = new AiProverbMeaningService({
      generate: vi.fn().mockResolvedValue({ found: true, meaning: "" }),
    });
    await expect(decline.generate("kata tak dikenal")).resolves.toBeNull();
    await expect(malformed.generate("kata tak dikenal")).resolves.toBeNull();
  });

  it("treats provider failures as unavailable", async () => {
    const service = new AiProverbMeaningService({ generate: vi.fn().mockRejectedValue(new Error("timeout")) });
    await expect(service.generate("Ada gula ada semut")).resolves.toBeNull();
  });
});
