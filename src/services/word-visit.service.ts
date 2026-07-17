import { createHash } from "node:crypto";
import { supabase } from "../config/supabase";

const WORD_VISITS_TABLE = "word_visits";

type SupabaseQueryResult<T = unknown> = {
  data?: T;
  error: { message?: string; code?: string } | null;
  count?: number | null;
};

type SupabaseLike = {
  from: (table: string) => {
    upsert: (
      values: Record<string, string>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ) => Promise<SupabaseQueryResult>;
    select: (
      columns: string,
      options: { count: "exact"; head: boolean },
    ) => {
      eq: (column: string, value: string) => Promise<SupabaseQueryResult>;
    };
  };
};

export class WordVisitService {
  static async trackWordVisit(
    word: string,
    visitorId: string | undefined,
    options: { client?: SupabaseLike; now?: Date } = {},
  ): Promise<number | null> {
    const normalizedWord = normalizeWord(word);
    const visitorHash = hashVisitorId(visitorId);

    if (!normalizedWord || !visitorHash) {
      return null;
    }

    const client = options.client || supabase;

    if (!client) {
      throw new Error("Supabase is not configured");
    }

    const visitedDate = toVisitedDate(options.now || new Date());

    const insertResult = await client
      .from(WORD_VISITS_TABLE)
      .upsert(
        {
          word: normalizedWord,
          visitor_hash: visitorHash,
          visited_date: visitedDate,
        },
        {
          onConflict: "word,visitor_hash,visited_date",
          ignoreDuplicates: true,
        },
      );

    if (insertResult.error) {
      throw new Error(insertResult.error.message || "Failed to record word visit");
    }

    const countResult = await client
      .from(WORD_VISITS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("word", normalizedWord);

    if (countResult.error) {
      throw new Error(countResult.error.message || "Failed to count word visits");
    }

    return countResult.count ?? 0;
  }
}

export function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

export function hashVisitorId(visitorId: string | undefined): string | null {
  const normalizedVisitorId = visitorId?.trim();

  if (!normalizedVisitorId) {
    return null;
  }

  return createHash("sha256").update(normalizedVisitorId).digest("hex");
}

function toVisitedDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
