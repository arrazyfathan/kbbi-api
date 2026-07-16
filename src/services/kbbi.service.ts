import * as cheerio from "cheerio";
import config from "../config";
import { Definition, Entry } from "../interfaces/kbbi.interface";
import { getScraperHtml, isHttpNotFound } from "../lib/http-client";

export class KbbiService {
  /**
   * Search for a word in KBBI
   * @param word The word to search for
   * @returns Array of entries or null if not found
   */
  static async search(word: string): Promise<Entry[] | null> {
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

  private static async fetchHtml(word: string): Promise<string> {
    return getScraperHtml(`${config.kbbiUrl}/${encodeURIComponent(word)}`);
  }

  private static parseHtml(html: string): Entry[] | null {
    const $ = cheerio.load(html);
    const results: Entry[] = [];

    // Remove unwanted elements like error messages or notices
    $(".body-content > h4:contains('Pesan')").nextAll().remove();

    const headwordElements = $(".body-content > h2");

    headwordElements.each((_, element) => {
      const headword = $(element).text().trim();
      const definitions: Definition[] = [];

      const listItems = $(element)
        .nextAll("ul, ol")
        .first()
        .find("li");

      if (listItems.length === 0) return;

      listItems.each((_, li) => {
        let wordClass = "";
        const spans = $(li).find("span");

        spans.each((_, span) => {
          const title = $(span).attr("title") || "";
          const text = $(span).text().trim();
          wordClass += `${text}[${title}] `;
          $(span).empty();
        });

        const description = $(li)
          .text()
          .replace(/\n/g, "")
          .trim();

        definitions.push({
          wordClass: wordClass.trim(),
          description,
        });
      });

      if (definitions.length > 0) {
        results.push({
          headword,
          definitions
        });
      }
    });

    return results.length > 0 ? results : null;
  }
}
