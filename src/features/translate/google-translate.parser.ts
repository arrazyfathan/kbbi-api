export type GoogleTranslateResponse = unknown;

export interface GoogleTranslateSegment {
  translated: string;
  source: string;
}

/**
 * Parses the payload returned by the unofficial Google Translate
 * translate.googleapis.com/translate_a/single endpoint.
 *
 * The response shape is:
 *   [
 *     [
 *       [translatedSegment, sourceSegment, ...],
 *       ...
 *     ],
 *     ...
 *   ]
 *
 * A single `q` containing newline-separated texts returns one or more
 * segments per line. Long lines are split across several segments, so the
 * translated text must be re-joined with the source fragments to reconstruct
 * each line's full translation.
 */
export function parseGoogleTranslateResponse(payload: GoogleTranslateResponse): GoogleTranslateSegment[] {
  const segments = Array.isArray(payload) ? payload[0] : undefined;

  if (!Array.isArray(segments)) {
    return [];
  }

  return segments
    .filter((segment): segment is unknown[] => Array.isArray(segment))
    .map((segment) => ({
      translated: typeof segment[0] === "string" ? segment[0] : "",
      source: typeof segment[1] === "string" ? segment[1] : "",
    }));
}
