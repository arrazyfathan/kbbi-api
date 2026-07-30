import * as cheerio from "cheerio";
import type { Definition, Entry } from "./kbbi.types";

export function parseKbbiHtml(html: string): Entry[] | null {
  const $ = cheerio.load(html);
  const results: Entry[] = [];

  // Remove unwanted elements like error messages or notices
  $(".body-content > h4:contains('Pesan')").nextAll().remove();

  const headwordElements = $(".body-content > h2");

  headwordElements.each((_, element) => {
    const headword = $(element).text().trim();
    const definitions: Definition[] = [];

    const listItems = $(element).nextAll("ul, ol").first().find("li");

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

      const description = $(li).text().replace(/\n/g, "").trim();

      definitions.push({
        wordClass: wordClass.trim(),
        description,
      });
    });

    if (definitions.length > 0) {
      results.push({
        headword,
        definitions,
      });
    }
  });

  return results.length > 0 ? results : null;
}
