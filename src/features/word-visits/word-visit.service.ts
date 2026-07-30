import { createHash } from "node:crypto";
import config from "../../config";
import { supabase } from "../../config/supabase";
import { upstreamUnavailableError } from "../../lib/api-error";
import logger from "../../lib/logger";
import type { TopVisitedWord } from "./word-visit.types";

const WORD_VISITS_TABLE = "word_visits";
const TOP_WORD_VISITS_VIEW = "top_word_visits";
const DEFAULT_TOP_WORDS_LIMIT = 10;
const MAX_TOP_WORDS_LIMIT = 100;
let didWarnMissingVisitorHashSalt = false;

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
      options?: { count: "exact"; head: boolean },
    ) => {
      eq: (column: string, value: string) => Promise<SupabaseQueryResult>;
      order: (
        column: string,
        options: { ascending: boolean },
      ) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          limit: (count: number) => Promise<SupabaseQueryResult<Array<{ word: string; visitor_count: number }>>>;
        };
      };
    };
  };
};

export class WordVisitService {
  constructor(
    private readonly options: { client?: SupabaseLike | null; now?: () => Date; visitorHashSalt?: string } = {},
  ) {}

  async trackWordVisit(word: string, visitorId: string | undefined): Promise<number | null> {
    const normalizedWord = normalizeWord(word);
    const visitorHash = hashVisitorId(visitorId, this.options.visitorHashSalt ?? config.visitorHashSalt);

    if (!normalizedWord || !visitorHash) {
      return null;
    }

    const client = this.options.client ?? supabase;

    if (!client) {
      throw upstreamUnavailableError("Supabase service is unavailable");
    }

    const visitedDate = toVisitedDate(this.options.now?.() || new Date());

    const insertResult = await client.from(WORD_VISITS_TABLE).upsert(
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
      throw upstreamUnavailableError("Supabase service is unavailable", insertResult.error);
    }

    const countResult = await client
      .from(WORD_VISITS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("word", normalizedWord);

    if (countResult.error) {
      throw upstreamUnavailableError("Supabase service is unavailable", countResult.error);
    }

    return countResult.count ?? 0;
  }

  async getTopVisitedWords(limit = DEFAULT_TOP_WORDS_LIMIT): Promise<TopVisitedWord[]> {
    const client = this.options.client ?? supabase;

    if (!client) {
      throw upstreamUnavailableError("Supabase service is unavailable");
    }

    const result = await client
      .from(TOP_WORD_VISITS_VIEW)
      .select("word, visitor_count")
      .order("visitor_count", { ascending: false })
      .order("word", { ascending: true })
      .limit(normalizeTopWordsLimit(limit));

    if (result.error) {
      throw upstreamUnavailableError("Supabase service is unavailable", result.error);
    }

    return (result.data || []).map((item) => ({
      word: item.word,
      visitorCount: item.visitor_count,
    }));
  }
}

export function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

export function hashVisitorId(visitorId: string | undefined, salt = config.visitorHashSalt): string | null {
  const normalizedVisitorId = visitorId?.trim();

  if (!normalizedVisitorId) {
    return null;
  }

  const normalizedSalt = salt?.trim() ?? "";

  if (!normalizedSalt && process.env.NODE_ENV !== "production" && !didWarnMissingVisitorHashSalt) {
    didWarnMissingVisitorHashSalt = true;
    logger.warn("VISITOR_HASH_SALT is not configured. Visitor hashes are unsalted outside production.");
  }

  return createHash("sha256").update(normalizedSalt).update("\0").update(normalizedVisitorId).digest("hex");
}

export function normalizeTopWordsLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_TOP_WORDS_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_TOP_WORDS_LIMIT);
}

function toVisitedDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
