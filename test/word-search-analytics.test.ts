import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("../src/config/supabase", () => ({ supabase: { rpc } }));
import { recordWordSearch } from "../src/features/word-visits/word-search-analytics";

describe("word search analytics", () => {
  it("records a source miss separately from an AI-generated response", async () => {
    rpc.mockResolvedValueOnce({ error: null });
    await recordWordSearch("demokrasi", { sourceMiss: true, aiGenerated: false, notFound: true, error: false });
    expect(rpc).toHaveBeenCalledWith("record_word_search", {
      p_word: "demokrasi",
      p_source_miss: true,
      p_ai_generated: false,
      p_not_found: true,
      p_error: false,
    });
  });
});
