import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashVisitorId, normalizeTopWordsLimit, normalizeWord, WordVisitService } from "../src/services/word-visit.service";

describe("WordVisitService", () => {
  it("normalizes words and hashes visitor identifiers", () => {
    expect(normalizeWord("  Demokrasi  ")).toBe("demokrasi");
    expect(hashVisitorId("mobile-visitor-1")).toBe(createHash("sha256").update("mobile-visitor-1").digest("hex"));
    expect(hashVisitorId("   ")).toBeNull();
    expect(hashVisitorId(undefined)).toBeNull();
  });

  it("returns null without a visitor id", async () => {
    const client = createSupabaseMock({ count: 10 });

    await expect(WordVisitService.trackWordVisit("demokrasi", undefined, { client })).resolves.toBeNull();
    expect(client.calls.upserts).toEqual([]);
    expect(client.calls.countWords).toEqual([]);
  });

  it("upserts one daily visit and returns the total count", async () => {
    const client = createSupabaseMock({ count: 3 });

    await expect(
      WordVisitService.trackWordVisit(" Demokrasi ", "visitor-1", {
        client,
        now: new Date("2026-07-17T12:00:00.000Z"),
      }),
    ).resolves.toBe(3);

    expect(client.calls.upserts).toEqual([
      {
        values: {
          word: "demokrasi",
          visitor_hash: createHash("sha256").update("visitor-1").digest("hex"),
          visited_date: "2026-07-17",
        },
        options: {
          onConflict: "word,visitor_hash,visited_date",
          ignoreDuplicates: true,
        },
      },
    ]);
    expect(client.calls.countWords).toEqual(["demokrasi"]);
  });

  it("throws when Supabase cannot record the visit", async () => {
    const client = createSupabaseMock({ upsertError: "insert failed" });

    await expect(WordVisitService.trackWordVisit("demokrasi", "visitor-1", { client })).rejects.toThrow("insert failed");
  });

  it("fetches top visited words ordered by visitor count and word", async () => {
    const client = createTopWordsSupabaseMock({
      data: [
        { word: "demokrasi", visitor_count: 12 },
        { word: "ajar", visitor_count: 8 },
      ],
    });

    await expect(WordVisitService.getTopVisitedWords(5, { client })).resolves.toEqual([
      { word: "demokrasi", visitorCount: 12 },
      { word: "ajar", visitorCount: 8 },
    ]);

    expect(client.calls).toEqual({
      table: "top_word_visits",
      select: "word, visitor_count",
      orders: [
        { column: "visitor_count", options: { ascending: false } },
        { column: "word", options: { ascending: true } },
      ],
      limit: 5,
    });
  });

  it("normalizes top word limits", () => {
    expect(normalizeTopWordsLimit(Number.NaN)).toBe(10);
    expect(normalizeTopWordsLimit(0)).toBe(10);
    expect(normalizeTopWordsLimit(10.8)).toBe(10);
    expect(normalizeTopWordsLimit(150)).toBe(100);
  });

  it("throws when Supabase cannot fetch top visited words", async () => {
    const client = createTopWordsSupabaseMock({ error: "view unavailable" });

    await expect(WordVisitService.getTopVisitedWords(10, { client })).rejects.toThrow("view unavailable");
  });
});

function createSupabaseMock(options: { count?: number; upsertError?: string; countError?: string }) {
  const calls: {
    upserts: Array<{
      values: Record<string, string>;
      options: { onConflict: string; ignoreDuplicates: boolean };
    }>;
    countWords: string[];
  } = {
    upserts: [],
    countWords: [],
  };

  return {
    calls,
    from(table: string) {
      expect(table).toBe("word_visits");

      return {
        async upsert(values: Record<string, string>, upsertOptions: { onConflict: string; ignoreDuplicates: boolean }) {
          calls.upserts.push({ values, options: upsertOptions });

          return {
            error: options.upsertError ? { message: options.upsertError } : null,
          };
        },
        select(columns: string, selectOptions: { count: "exact"; head: boolean }) {
          expect(columns).toBe("id");
          expect(selectOptions).toEqual({ count: "exact", head: true });

          return {
            async eq(column: string, value: string) {
              expect(column).toBe("word");
              calls.countWords.push(value);

              return {
                count: options.count ?? 0,
                error: options.countError ? { message: options.countError } : null,
              };
            },
            order() {
              throw new Error("order should not be called for visit tracking");
            },
          };
        },
      };
    },
  };
}

function createTopWordsSupabaseMock(options: {
  data?: Array<{ word: string; visitor_count: number }>;
  error?: string;
}) {
  const calls: {
    table?: string;
    select?: string;
    orders: Array<{ column: string; options: { ascending: boolean } }>;
    limit?: number;
  } = {
    orders: [],
  };

  return {
    calls,
    from(table: string) {
      calls.table = table;

      return {
        async upsert() {
          throw new Error("upsert should not be called for top words");
        },
        select(columns: string) {
          calls.select = columns;

          return {
            async eq() {
              throw new Error("eq should not be called for top words");
            },
            order(column: string, orderOptions: { ascending: boolean }) {
              calls.orders.push({ column, options: orderOptions });

              return {
                order(nextColumn: string, nextOrderOptions: { ascending: boolean }) {
                  calls.orders.push({ column: nextColumn, options: nextOrderOptions });

                  return {
                    async limit(count: number) {
                      calls.limit = count;

                      return {
                        data: options.data || [],
                        error: options.error ? { message: options.error } : null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}
