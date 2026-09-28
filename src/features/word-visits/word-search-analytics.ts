import { supabase } from "../../config/supabase";
import logger from "../../lib/logger";

export async function recordWordSearch(
  word: string,
  outcome: { sourceMiss: boolean; aiGenerated: boolean; notFound: boolean; error: boolean },
): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc("record_word_search", {
      p_word: word,
      p_source_miss: outcome.sourceMiss,
      p_ai_generated: outcome.aiGenerated,
      p_not_found: outcome.notFound,
      p_error: outcome.error,
    });
    if (error && error.code !== "PGRST202" && error.code !== "42883") {
      logger.warn({ err: error }, "Unable to record word search");
    }
  } catch (error) {
    logger.warn({ err: error }, "Unable to record word search");
  }
}
