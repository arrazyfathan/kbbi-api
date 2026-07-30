import config from "../../config";
import { getScraperHtml, isHttpNotFound } from "../../lib/http-client";
import { parseKbbiHtml } from "./kbbi.parser";
import type { Entry } from "./kbbi.types";

export class KbbiService {
  /**
   * Search for a word in KBBI
   * @param word The word to search for
   * @returns Array of entries or null if not found
   */
  async search(word: string): Promise<Entry[] | null> {
    try {
      const html = await this.fetchHtml(word);
      return this.parseHtml(html);
    } catch (error: any) {
      if (isHttpNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private async fetchHtml(word: string): Promise<string> {
    return getScraperHtml(`${config.kbbiUrl}/${encodeURIComponent(word)}`, {
      timeoutMs: config.upstream.kbbiFetchTimeoutMs,
      upstream: "kbbi",
    });
  }

  private parseHtml(html: string): Entry[] | null {
    return parseKbbiHtml(html);
  }
}
